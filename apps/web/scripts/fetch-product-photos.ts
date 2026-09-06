/**
 * Unsplash 에서 실제 상품 사진을 받아 저장소에 올린다.
 *
 * 시드가 만들던 톤 블록은 **명백한 플레이스홀더**라 화면이 실제로 어떻게
 * 보이는지 알 수 없었다. 이미지 최적화가 얼마나 줄여 주는지도 단색 PNG
 * 로는 가늠이 안 된다.
 *
 * **아무 데서나 긁어 오지 않는다.** 상품 사진은 대부분 그 브랜드나 촬영자의
 * 저작물이고, 공개 배포된 사이트에 올리는 순간 남의 것을 서비스처럼 보여
 * 주는 셈이 된다. Unsplash 는 라이선스가 상업적 사용까지 허용한다.
 *
 * API 가이드라인이 요구하는 두 가지를 지킨다.
 *   1. 사진을 받을 때 다운로드 엔드포인트를 한 번 호출한다(집계용).
 *   2. 작가를 기록한다. ProductImage.credit 에 남기고 화면이 보여 준다.
 *
 * 다시 돌려도 안전하다 — 이미 사진이 있는 상품은 건너뛴다.
 *
 * `--replace` 를 주면 **출처가 없는 사진(우리가 만든 플레이스홀더)을 먼저
 * 지운다.** 출처가 있는 사진은 건드리지 않는다 — 이미 받아 둔 진짜 사진을
 * 실수로 날리는 일이 없어야 한다. 저장소 객체까지 함께 지운다.
 */
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@shop/db';
import { imageObjectKey, defaultAlt, verifyImageBytes } from '@shop/core';
import { makeBlur } from '../src/lib/images/blur';

const ACCESS_KEY = process.env['UNSPLASH_ACCESS_KEY'];
if (!ACCESS_KEY) {
  console.error(
    'UNSPLASH_ACCESS_KEY 가 없습니다.\n' +
      'https://unsplash.com/oauth/applications/new 에서 앱을 만들고 Access Key 를 .env 에 넣어 주세요.',
  );
  process.exit(1);
}

/**
 * 상품마다 무엇을 찾을지.
 *
 * **자동 번역에 맡기지 않는다.** "워시드 데님 스트레이트" 를 그대로 넘기면
 * 청바지가 아니라 엉뚱한 것이 온다. 여덟 개뿐이라 손으로 적는 편이 정확하고,
 * 상품이 늘면 그때 이 표에 한 줄을 더한다.
 */
const QUERY: Readonly<Record<string, string>> = {
  'oversized-wool-coat': 'wool overcoat fashion',
  'short-padding-blouson': 'puffer jacket fashion',
  'lambswool-crewneck': 'knit sweater fashion',
  'wool-double-jacket': 'wool blazer fashion',
  'cotton-twill-wide-pants': 'wide leg trousers fashion',
  'cable-knit-muffler': 'knit scarf fashion',
  'heavy-cotton-hoodie': 'hoodie fashion',
  'washed-denim-straight': 'denim jeans fashion',
};

const PER_PRODUCT = 2;

interface UnsplashPhoto {
  readonly id: string;
  readonly urls: { readonly raw: string };
  readonly links: { readonly download_location: string };
  readonly user: { readonly name: string; readonly links: { readonly html: string } };
}

const auth = { Authorization: `Client-ID ${ACCESS_KEY}` };

async function search(query: string): Promise<UnsplashPhoto[]> {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'portrait');
  // 필요한 것보다 넉넉히 받아 둔다. 같은 사진이 여러 상품에 겹치는 것을 피한다.
  url.searchParams.set('per_page', '12');
  url.searchParams.set('content_filter', 'high');

  const response = await fetch(url, { headers: auth });
  if (!response.ok) {
    throw new Error(`Unsplash 검색 실패 (${response.status}) — ${query}`);
  }
  const body = (await response.json()) as { results: UnsplashPhoto[] };
  return body.results;
}

/**
 * 다운로드 집계를 알린다.
 *
 * API 가이드라인이 요구한다. 실패해도 진행을 멈추지 않는다 — 사진은 이미
 * 받았고, 집계 한 건이 빠지는 것이 여기서 멈추는 것보다 낫다.
 */
async function reportDownload(photo: UnsplashPhoto): Promise<void> {
  try {
    await fetch(photo.links.download_location, { headers: auth });
  } catch (error) {
    console.warn('  다운로드 집계 실패(무시)', photo.id, error);
  }
}

/** 상품 목록에 쓰기 좋은 크기로 받는다. 원본은 수천 픽셀이라 그대로 쓸 이유가 없다. */
async function download(photo: UnsplashPhoto): Promise<Buffer> {
  const url = new URL(photo.urls.raw);
  url.searchParams.set('w', '1200');
  url.searchParams.set('h', '1500');
  url.searchParams.set('fit', 'crop');
  url.searchParams.set('fm', 'jpg');
  url.searchParams.set('q', '80');

  const response = await fetch(url);
  if (!response.ok) throw new Error(`사진 내려받기 실패 (${response.status}) — ${photo.id}`);
  return Buffer.from(await response.arrayBuffer());
}

const endpoint = process.env['S3_ENDPOINT'];
const s3 = new S3Client({
  region: process.env['S3_REGION'] ?? 'us-east-1',
  ...(endpoint ? { endpoint } : {}),
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? '',
  },
});
const bucket = process.env['S3_BUCKET'] ?? '';
const publicBase = (process.env['S3_PUBLIC_BASE_URL'] ?? '').replace(/\/+$/, '');

/**
 * 플레이스홀더를 지운다.
 *
 * 기준은 **출처가 없다는 것**이다. 우리가 만든 톤 블록에는 credit 이 없고,
 * Unsplash 에서 받은 사진에는 있다. "전부 지운다" 로 두면 두 번째 실행에서
 * 방금 받은 사진까지 날아간다.
 */
async function clearPlaceholders(): Promise<number> {
  const rows = await prisma.productImage.findMany({
    where: { credit: null },
    select: { id: true, storageKey: true },
  });

  for (const row of rows) {
    if (row.storageKey) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: row.storageKey }));
      } catch (error) {
        // 저장소에 남아도 화면에는 보이지 않는다. 행을 지우는 것이 먼저다.
        console.warn('  저장소 객체 삭제 실패(무시)', row.storageKey, error);
      }
    }
  }

  const { count } = await prisma.productImage.deleteMany({ where: { credit: null } });
  return count;
}

/**
 * 어느 DB·버킷을 건드리는지 먼저 밝힌다.
 *
 * **이 프로젝트에서 두 번 당한 자리다.** 운영에 넣으려고 돌렸는데 저장소
 * .env 의 localhost 로 붙어서, "건너뜀 … 이미 2장" 이 줄줄이 찍히고 성공한
 * 것처럼 보였다. 사람이 주소를 볼 수 있으면 그 자리에서 알아챈다.
 *
 * 비밀번호는 찍지 않는다 — 로그와 터미널 기록에 남는다.
 */
function announceTarget(): void {
  const raw = process.env['DATABASE_URL'] ?? '';
  let where = '(DATABASE_URL 없음)';
  try {
    where = new URL(raw).host;
  } catch {
    // 형식이 이상해도 여기서 멈추지 않는다. Prisma 가 곧 제대로 된 오류를 낸다.
  }
  console.log(`DB     : ${where}`);
  console.log(`저장소 : ${bucket || '(S3_BUCKET 없음)'} → ${publicBase || '(공개 주소 없음)'}\n`);
}

async function main(): Promise<void> {
  announceTarget();

  if (process.argv.includes('--replace')) {
    const removed = await clearPlaceholders();
    console.log(`플레이스홀더 ${removed}장 삭제\n`);
  }

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, slug: true, name: true,
      brand: { select: { name: true } },
      _count: { select: { images: true } },
    },
  });

  /** 이미 쓴 사진. 여러 상품에 같은 사진이 붙으면 목록이 이상해진다. */
  const used = new Set<string>();
  let created = 0;

  for (const product of products) {
    if (product._count.images > 0) {
      console.log(`건너뜀 ${product.name} — 이미 ${product._count.images}장`);
      continue;
    }

    const query = QUERY[product.slug];
    if (!query) {
      console.warn(`검색어 없음 ${product.slug} — QUERY 표에 한 줄을 더해 주세요`);
      continue;
    }

    const candidates = (await search(query)).filter((p) => !used.has(p.id));
    if (candidates.length < PER_PRODUCT) {
      console.warn(`후보 부족 ${product.name} (${candidates.length}장)`);
    }

    for (const [i, photo] of candidates.slice(0, PER_PRODUCT).entries()) {
      const bytes = await download(photo);
      // 업로드 경로와 같은 규칙으로 검사한다. 여기만 느슨하면 규칙이 두 벌이 된다.
      const contentType = verifyImageBytes({ bytes, declaredType: 'image/jpeg' });

      const key = imageObjectKey({
        productId: product.id,
        contentType,
        token: randomBytes(12).toString('base64url'),
      });

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: bytes,
        ContentType: contentType,
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `${publicBase}/${key}`,
          storageKey: key,
          blurDataUrl: await makeBlur(bytes),
          sortOrder: i,
          alt: defaultAlt({
            brandName: product.brand.name,
            productName: product.name,
            index: i,
          }),
          credit: photo.user.name,
          creditUrl: photo.user.links.html,
        },
      });

      await reportDownload(photo);
      used.add(photo.id);
      created += 1;
      console.log(`  ${product.name} ${i + 1}/${PER_PRODUCT} — ${photo.user.name}`);
    }
  }

  console.log(`\n총 ${created}장 생성`);
  await prisma.$disconnect();
}

await main();
