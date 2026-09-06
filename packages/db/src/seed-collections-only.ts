/**
 * 기획전만 따로 넣는다.
 *
 * `db:seed` 는 상품·쿠폰·공지까지 전부 다시 쓴다. 이미 돌고 있는 곳에서는
 * **운영자가 어드민에서 고친 상품 이름과 가격이 시드 값으로 되돌아간다.**
 * 기획전 하나를 넣으려고 그럴 수는 없다.
 *
 * 사진은 여기서 넣지 않는다 — 바깥(Unsplash)과 저장소가 필요해서
 * `pnpm --filter @shop/web run seed:collections` 가 따로 덮는다.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

// seed.ts 와 같은 방식으로 저장소 루트의 .env 를 읽는다.
// **환경변수로 준 값이 이깁니다** — 배포 DB 를 겨눌 때 그렇게 씁니다.
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { prisma } from './client';
import { seedCollections } from './seed-collections';

/** 어느 DB 를 건드리는지 먼저 밝힌다. 이 프로젝트에서 두 번 당한 자리다. */
function announceTarget(): void {
  let where = '(DATABASE_URL 없음)';
  try {
    where = new URL(process.env['DATABASE_URL'] ?? '').host;
  } catch {
    // 형식이 이상해도 여기서 멈추지 않는다. Prisma 가 곧 제대로 된 오류를 낸다.
  }
  console.log(`DB: ${where}\n`);
}

announceTarget();
await seedCollections();
await prisma.$disconnect();
