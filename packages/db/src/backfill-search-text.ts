/**
 * 검색이 보는 칸을 지금 값으로 다시 채운다.
 *
 * 이 칸을 채우는 규칙이 한동안 어드민 쓰기 경로에만 있어서, **시드로만 만든
 * DB 에서는 검색이 아무것도 못 찾았다.** 시드는 고쳤지만 이미 돌고 있는 곳은
 * 그대로다 — 상품을 한 번씩 저장하면 채워지지만, 그러자고 사람을 시킬 일이
 * 아니다.
 *
 * 이름과 브랜드에서 다시 만들 뿐이라 여러 번 돌려도 같다.
 */
import { resolve } from 'node:path';
import { config } from 'dotenv';

// seed.ts 와 같은 방식으로 저장소 루트의 .env 를 읽는다.
// **환경변수로 준 값이 이깁니다** — 배포 DB 를 겨눌 때 그렇게 씁니다.
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { searchTextFor } from '@shop/core';
import { prisma } from './client';

function announceTarget(): void {
  let where = '(DATABASE_URL 없음)';
  try {
    where = new URL(process.env['DATABASE_URL'] ?? '').host;
  } catch {
    // Prisma 가 곧 제대로 된 오류를 낸다
  }
  console.log(`DB: ${where}\n`);
}

announceTarget();

const products = await prisma.product.findMany({
  where: { deletedAt: null },
  select: { id: true, name: true, searchText: true, brand: { select: { name: true } } },
});

let fixed = 0;
for (const p of products) {
  const next = searchTextFor({ name: p.name, brandName: p.brand.name });
  if (next === p.searchText) continue;
  await prisma.product.update({ where: { id: p.id }, data: { searchText: next } });
  fixed += 1;
}

console.log(`상품 ${products.length}개 중 ${fixed}개를 채웠습니다`);
await prisma.$disconnect();
