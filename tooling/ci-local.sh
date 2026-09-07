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
# 쓰는 법:  pnpm ci:local
set -euo pipefail

DB_NAME=plain_ci_local
CONTAINER=shop-postgres

if ! docker exec "$CONTAINER" true 2>/dev/null; then
  echo "docker 컨테이너 '$CONTAINER' 가 떠 있지 않습니다. pnpm db:up 을 먼저 하세요." >&2
  exit 1
fi

echo "▸ 일회용 DB 를 새로 만든다 ($DB_NAME)"
docker exec "$CONTAINER" psql -U shop -d postgres -c "drop database if exists $DB_NAME;" >/dev/null
docker exec "$CONTAINER" psql -U shop -d postgres -c "create database $DB_NAME;" >/dev/null

# 개발 DB 를 건드리지 않는다. 이 스크립트 안에서만 쓰는 주소다.
export DATABASE_URL="postgresql://shop:shop@localhost:5432/$DB_NAME"
export BETTER_AUTH_SECRET="ci-only-secret-not-used-anywhere-else-0000"
export BETTER_AUTH_URL="http://localhost:3100"

echo "▸ CI 에 없는 것을 지운다 (생성물 · 빌드 산출물 · 캐시)"
rm -rf packages/db/src/generated apps/web/.next .turbo

cleanup() {
  docker exec "$CONTAINER" psql -U shop -d postgres -c "drop database if exists $DB_NAME;" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "▸ DB 준비"
pnpm --filter @shop/db run generate
pnpm --filter @shop/db exec prisma migrate deploy
pnpm --filter @shop/db run seed
pnpm --filter @shop/auth run seed

# CI 와 같은 순서다. 의존성 권고를 먼저 보는 이유는 이것만 turbo 밖에
# 있어서다 — 패키지별 작업이 아니라 잠금 파일 하나를 보는 일이다.
echo "▸ audit"
node tooling/audit.mjs

for step in lint typecheck test build e2e; do
  echo "▸ $step"
  pnpm turbo run "$step"
done

echo
echo "✓ CI 와 같은 조건에서 전부 통과했습니다."
