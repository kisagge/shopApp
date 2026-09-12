#!/usr/bin/env bash
#
# CI 가 도는 것과 같은 조건을 로컬에서 만든다.
#
# **왜 필요한가.** 이 저장소에서 CI 만 깨지는 일이 세 번 있었다. 셋 다
# 원인이 같았다 — 내 기계에는 남아 있고 CI 에는 없는 것에 기댄 것이다:
#   · 개발하며 로컬 DB 에 쌓인 주문 (E2E 가 그걸 시드인 줄 알았다)
#   · 빌드가 만들어 둔 라우트 타입 (lint 가 그걸 전제했다)
#   · 이미 만들어져 있던 Prisma 클라이언트 (시드가 그걸 전제했다)
#
# 눈으로는 안 보이는 종류라, 지우고 한 번 돌려 보는 것 말고는 방법이 없다.
#
# **문지기는 둘이다.**
#
#   pnpm ci:quick   푸시 전.   lint · typecheck · build · 단위 (~1분 30초)
#   pnpm ci:local   전체.      거기에 e2e 까지 (~5분 30초)
#
# 나눈 이유는 시간이다. 재 보니 전체의 3분의 2가 e2e 였고(701개를 진짜
# 브라우저로 돈다), 워커를 늘리는 것은 답이 아니었다 — 서버가 하나라
# 5 → 7 → 10 으로 갈수록 오히려 느려졌고 10 에서는 멀쩡한 검사가 깨졌다.
#
# **다만 이 저장소는 푸시가 곧 배포다.** Vercel 이 Git 연동으로 직접 올리므로,
# 빠른 쪽만 돌리고 밀면 화면이 깨진 채로 배포될 수 있다. 그래서 규칙은
# "빠른 쪽으로 갈음한다" 가 아니라 **"화면·API·스키마를 건드렸으면 전체"** 다.
# 문서와 검사만 고쳤을 때가 빠른 쪽의 자리다.
#
# 빠른 쪽은 일회용 DB 를 만들지 않는다 — 단위 검사는 전부 목 위에서 돌고,
# DB 를 쓰는 것은 e2e 뿐이다.
set -euo pipefail

# **빠른 쪽은 전체의 앞부분이다.** 순서가 갈라지면 두 문지기가 다른 것을
# 보게 된다. 그 약속은 ci-order 검사가 지킨다.
STEPS="lint typecheck build test e2e"

MODE="${1:-full}"
if [ "$MODE" = quick ]; then
  STEPS="lint typecheck build test"
fi

DB_NAME=plain_ci_local
CONTAINER=shop-postgres

if [ "$MODE" = full ]; then
  if ! docker exec "$CONTAINER" true 2>/dev/null; then
    echo "docker 컨테이너 '$CONTAINER' 가 떠 있지 않습니다. pnpm db:up 을 먼저 하세요." >&2
    exit 1
  fi

  echo "▸ 일회용 DB 를 새로 만든다 ($DB_NAME)"
  docker exec "$CONTAINER" psql -U shop -d postgres -c "drop database if exists $DB_NAME;" >/dev/null
  docker exec "$CONTAINER" psql -U shop -d postgres -c "create database $DB_NAME;" >/dev/null
fi

# 개발 DB 를 건드리지 않는다. 이 스크립트 안에서만 쓰는 주소다.
export DATABASE_URL="postgresql://shop:shop@localhost:5432/$DB_NAME"
export BETTER_AUTH_SECRET="ci-only-secret-not-used-anywhere-else-0000"
export BETTER_AUTH_URL="http://localhost:3100"

echo "▸ CI 에 없는 것을 지운다 (생성물 · 빌드 산출물 · 캐시)"
rm -rf packages/db/src/generated apps/web/.next .turbo

cleanup() {
  docker exec "$CONTAINER" psql -U shop -d postgres -c "drop database if exists $DB_NAME;" >/dev/null 2>&1 || true

  # **빌드 산출물도 함께 치운다.**
  #
  # 이 스크립트는 일회용 DB 로 빌드한다. 그런데 .next 를 남겨 두면 다음에
  # `playwright test` 를 바로 돌릴 때 그 캐시를 다시 쓴다 — 개발 DB 를 보고
  # 있는 줄 알면서 화면에는 일회용 DB 의 값이 뜬다.
  #
  # 실제로 겪었다. 상품 화면이 리뷰 7개(평점 4.6)인 DB 를 보면서 "리뷰 6"
  # 평점 4.0 을 그렸고, 목록은 비어 있었다. 검사가 지는데 DB 를 아무리 봐도
  # 멀쩡해서 원인을 한참 찾았다.
  #
  # DB 를 지우는 것과 같은 이유다 — 이 스크립트가 만든 것은 이 스크립트가 치운다.
  rm -rf apps/web/.next
}
trap cleanup EXIT

# Prisma 클라이언트는 두 쪽 다 필요하다 — 위에서 지웠고, 타입체크가 그것을 본다.
echo "▸ Prisma 클라이언트"
pnpm --filter @shop/db run generate

if [ "$MODE" = full ]; then
  echo "▸ DB 준비"
  pnpm --filter @shop/db exec prisma migrate deploy
  pnpm --filter @shop/db run seed
  pnpm --filter @shop/auth run seed
fi

# CI 와 같은 순서다. 의존성 권고를 먼저 보는 이유는 이것만 turbo 밖에
# 있어서다 — 패키지별 작업이 아니라 잠금 파일 하나를 보는 일이다.
echo "▸ audit"
node tooling/audit.mjs

# **빌드가 검사보다 먼저다.** client-dictionary 검사는 소스가 아니라 빌드
# 결과(.next/static/chunks)를 본다 — 소스만 보면 Turbopack 이 청크를 합치는
# 것을 못 보기 때문이다. 위에서 .next 를 지우므로, 검사를 먼저 돌리면 그
# 검사는 건너뛴다. 실제로 그렇게 한 번도 안 돌고 있었다. 순서는 ci.yml 과
# 함께 test/ci-order.test.ts 가 지킨다.
for step in $STEPS; do
  echo "▸ $step"
  pnpm turbo run "$step"
done

echo
if [ "$MODE" = quick ]; then
  # **안 본 것을 말해 준다.** 통과했다는 말만 하면 전부 봤다고 읽힌다.
  echo "✓ 빠른 문지기 통과 — lint · typecheck · build · 단위"
  echo "  e2e 는 안 돌았습니다. 화면·API·스키마를 건드렸다면 pnpm ci:local 을 돌리세요."
  echo "  (푸시하면 Vercel 이 그대로 배포합니다)"
else
  echo "✓ CI 와 같은 조건에서 전부 통과했습니다."
fi
