/**
 * 이미 들어 있는 사진에 자리표시 그림을 채워 넣는다.
 *
 * 새로 올리는 사진은 업로드 경로가 바로 만든다. 이 스크립트는 **그 전에
 * 들어온 것**과, 사진을 넣는 시드 스크립트가 지나간 뒤를 위한 것이다.
 *
 * **이미 있는 행은 건드리지 않는다.** 다시 돌려도 같고, 중간에 끊겨도 이어서
 * 돌리면 된다 — 사진마다 내려받아 줄이는 일이라 한 번에 끝나지 않을 수 있다.
 *
 * 운영 DB 를 향할 수 있으므로 **어디에 쓰는지 먼저 찍는다.** 검색 칸 채우기
 * 스크립트와 같은 규칙이다.
 */
import { prisma } from '@shop/db';
import { makeBlurFromUrl } from '../src/lib/images/blur';

function targetHost(): string {
  const url = process.env['DATABASE_URL'];
  if (!url) return '(DATABASE_URL 없음)';
  try {
    // 자격증명은 찍지 않는다
    return new URL(url).host;
  } catch {
    return '(주소를 읽을 수 없음)';
  }
}

type Row = { id: string; url: string };

async function fill(
  label: string,
  rows: Row[],
  save: (id: string, blurDataUrl: string) => Promise<unknown>,
): Promise<void> {
  if (rows.length === 0) {
    console.log(`${label}: 채울 것 없음`);
    return;
  }

  let done = 0;
  let skipped = 0;
  const sizes: number[] = [];

  for (const row of rows) {
    const blurDataUrl = await makeBlurFromUrl(row.url);
    if (blurDataUrl === null) {
      // 못 만든 것과 상한을 넘은 것을 구분하지 않는다 — 둘 다 없이 간다
      skipped += 1;
      continue;
    }
    await save(row.id, blurDataUrl);
    sizes.push(blurDataUrl.length);
    done += 1;
  }

  const avg = sizes.length === 0 ? 0 : Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);
  const max = sizes.length === 0 ? 0 : Math.max(...sizes);
  console.log(
    `${label}: ${done}장 채움${skipped > 0 ? ` · ${skipped}장 건너뜀` : ''}` +
      (sizes.length > 0 ? ` · 평균 ${avg}B · 최대 ${max}B` : ''),
  );
}

async function main(): Promise<void> {
  console.log(`대상 DB: ${targetHost()}\n`);

  const images = await prisma.productImage.findMany({
    where: { blurDataUrl: null },
    select: { id: true, url: true },
  });
  await fill('상품 사진', images, (id, blurDataUrl) =>
    prisma.productImage.update({ where: { id }, data: { blurDataUrl } }),
  );

  const banners = await prisma.banner.findMany({
    where: { blurDataUrl: null, imageUrl: { not: null } },
    select: { id: true, imageUrl: true },
  });
  await fill(
    '배너',
    banners.flatMap((b) => (b.imageUrl ? [{ id: b.id, url: b.imageUrl }] : [])),
    (id, blurDataUrl) => prisma.banner.update({ where: { id }, data: { blurDataUrl } }),
  );

  const collections = await prisma.collection.findMany({
    where: { blurDataUrl: null, imageUrl: { not: null } },
    select: { id: true, imageUrl: true },
  });
  await fill(
    '기획전',
    collections.flatMap((c) => (c.imageUrl ? [{ id: c.id, url: c.imageUrl }] : [])),
    (id, blurDataUrl) => prisma.collection.update({ where: { id }, data: { blurDataUrl } }),
  );
}

await main();
await prisma.$disconnect();
