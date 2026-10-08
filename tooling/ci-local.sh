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

# **개발 서버와 같은 폴더를 쓰지 않는다.**
#
# 아래에서 빌드 산출물을 지우는데, 작업하며 띄워 둔 `next dev` 는 `.next` 에 계속 쓴다 — `rm` 이
# "Directory not empty" 로 반쯤 실패하고, 반쯤 지워진 자리에서 빌드가 글꼴 모듈을 못 찾아 졌다.
# 이 스크립트는 자기 폴더에서 빌드한다(next.config.ts 의 distDir 이 이 변수를 읽는다).
export NEXT_DIST_DIR=.next-ci

echo "▸ CI 에 없는 것을 지운다 (생성물 · 빌드 산출물 · 캐시)"
rm -rf packages/db/src/generated "apps/web/$NEXT_DIST_DIR" .turbo

cleanup() {
  # **정리가 판정을 뒤집지 않는다.**
  #
  # 트랩의 마지막 명령이 실패하면 그것이 스크립트의 끝 상태가 된다 — 실제로 전부 통과한 판에서
  # `rm` 하나가 "Directory not empty" 로 걸려 exit 1 이 나왔다. 그 숫자를 보고 다음 사람은 멀쩡한
  # 코드를 뒤진다. 들어올 때의 상태를 쥐고 있다가 그대로 내보낸다.
  status=$?

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
  #
  # **치우다 걸려도 넘어간다.** 방금 세운 `next start` 가 내려가는 중이면 그 폴더에 아직 손이 닿아
  # 있어서 "Directory not empty" 가 난다. 남겨 둬도 다음 실행이 시작할 때 지우고(그때는 아무 서버도
  # 없다), 이 폴더는 이 스크립트만 쓴다 — 개발 서버는 `.next` 를 본다.
  rm -rf "apps/web/$NEXT_DIST_DIR" 2>/dev/null || true
  # **여기서 실패하면 안 된다.** `[ -n "" ]` 는 1 로 끝나는데, set -e 아래의 트랩에서는 그것이
  # 트랩을 끊고 그 1 이 스크립트의 끝 상태가 된다 — 정리가 판정을 뒤집는 그 고장이다.
  if [ -n "${E2E_LOG:-}" ]; then rm -f "$E2E_LOG"; fi

  exit "$status"
}
trap cleanup EXIT

# **잠금 파일이 package.json 과 맞는가.**
#
# 여기는 기계에 이미 깔린 node_modules 로 돈다. 그래서 의존성을 고치고 잠금 파일을 커밋하지 않아도
# 멀쩡히 통과하는데, CI 와 Vercel 은 `--frozen-lockfile` 로 처음부터 깔기 때문에 거기서야 깨진다 —
# 이 저장소는 푸시가 곧 배포라 그 자리는 "배포가 깨졌다" 로 나타난다. 바뀐 것이 없으면 몇 초다.
echo "▸ 잠금 파일"
pnpm install --frozen-lockfile

# Prisma 클라이언트는 두 쪽 다 필요하다 — 위에서 지웠고, 타입체크가 그것을 본다.
echo "▸ Prisma 클라이언트"
pnpm --filter @shop/db run generate

if [ "$MODE" = full ]; then
  echo "▸ DB 준비"
  pnpm --filter @shop/db exec prisma migrate deploy
  pnpm --filter @shop/db run seed
  pnpm --filter @shop/auth run seed
fi

# **여기는 문지기다.** 검사 도구들이 "문지기로 돌고 있다" 를 알아야 켜는 것들이 있다.
#
#   · 재시도 한 번(CI 와 같게). 한 번 흔들린 판이 그대로 빨갛게 끝나면 멀쩡한 코드를 뒤지게 된다 —
#     실제로 두 판을 그렇게 썼다. 재시도가 붙으면 "재시도로 통과" 가 찍혀 로직이 아니라 타이밍이라는
#     것이 바로 보인다. 그렇다고 넘어가지는 않는다(아래에서 세어 이름을 적는다).
#   · **`.only` 막기.** 한 줄만 돌려 보려고 붙이는 표시를 지우지 않고 커밋하면 그 파일의 나머지가
#     조용히 안 돈다 — 문지기가 무엇을 봤는지 아무도 모르는 초록이 된다. CI 는 막고 있었는데 여기만
#     안 막고 있었고, 여기서 초록은 "커밋해도 된다" 는 뜻이라 더 위험하다.
export GATE=1

E2E_LOG=""
if [ "$MODE" = full ]; then
  E2E_LOG="$(mktemp -t ci-local-e2e)"
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
  if [ "$step" = test ]; then
    # vitest 는 CI 깃발로 `.only` 를 막는다(allowOnly 의 기본값). 그 한 단계만 CI 와 같은 깃발로 돈다 —
    # 전체에 걸면 Playwright 의 워커 수·리포터까지 CI 모양이 되어 로컬 게이트가 크게 느려진다.
    CI=1 pnpm turbo run test
  elif [ "$step" = e2e ] && [ -n "$E2E_LOG" ]; then
    # pipefail 이 켜져 있어 tee 를 지나도 실패는 그대로 실패다
    pnpm turbo run e2e | tee "$E2E_LOG"
  else
    pnpm turbo run "$step"
  fi
done

# **재시도로 통과한 것을 눈에 띄게.** Playwright 는 결국 통과했으면 0 으로 끝난다 —
# "N flaky" 는 요약 한 줄로 지나가고, 수백 줄 로그의 가운데에서는 아무도 못 본다.
FLAKY=""
if [ -n "$E2E_LOG" ] && [ -f "$E2E_LOG" ]; then
  FLAKY="$(awk '/[0-9]+ flaky/{f=1} f && /[0-9]+ (passed|did not run)/{exit} f{print}' "$E2E_LOG" || true)"
fi

echo
if [ "$MODE" = quick ]; then
  # **안 본 것을 말해 준다.** 통과했다는 말만 하면 전부 봤다고 읽힌다.
  echo "✓ 빠른 문지기 통과 — lint · typecheck · build · 단위"
  echo "  e2e 는 안 돌았습니다. 화면·API·스키마를 건드렸다면 pnpm ci:local 을 돌리세요."
  echo "  (푸시하면 Vercel 이 그대로 배포합니다)"
elif [ -n "$FLAKY" ]; then
  echo "✗ 전부 통과하기는 했지만 — 재시도로 통과한 검사가 있습니다."
  echo
  echo "$FLAKY" | sed 's/^/  /'
  echo
  echo "  **이 판은 초록이 아닙니다.** 그 검사는 지금 조건이 아니라 운에 기대고 있습니다."
  echo "  한 번 더 돌려 같은 자리가 또 나오면 그 검사(또는 그 화면)를 고치세요 —"
  echo "  기다림의 상한이 검사의 상한보다 크지는 않은지부터 봅니다."
  exit 1
else
  echo "✓ CI 와 같은 조건에서 전부 통과했습니다."
  echo
  # **같지 않은 것도 말해 준다.** "같은 조건" 이라고만 하면 여기 초록을 CI 초록으로 읽는다.
  echo "  다만 여기서 못 보는 것: 리눅스에서만 나는 것(글꼴·시스템 의존성),"
  echo "  그리고 E2E 동시성(여기는 코어 수, CI 는 2) — 경합은 둘 중 한쪽에서만 드러나기도 합니다."
fi
