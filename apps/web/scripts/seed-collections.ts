/**
 * 배너와 기획전에 **배경 사진을 깐다.**
 *
 * 기획전 자체는 DB 시드(@shop/db 의 seed-collections)가 만든다 — 그쪽은
 * 바깥에 나가지 않아 CI 에서도 돈다. 여기서 하는 일은 사진뿐이고, 사진은
 * Unsplash 와 저장소가 있어야 하므로 사람이 따로 돌린다.
 *
 * 배너에는 처음부터 배경 이미지를 넣을 수 있었는데 **하나도 들어 있지
 * 않았다.** 그래서 홈이 늘 톤 블록이었고, 배너가 데려갈 곳도 카테고리뿐이라
 * "기획전 보기" 라고 적힌 버튼이 실제로는 카테고리 목록으로 갔다. 여기서
 * 링크도 함께 기획전으로 돌린다.
 *
 * 사진은 상품 사진과 **같은 규칙**으로 받는다 — Unsplash 라이선스, 다운로드
 * 집계 호출, 작가 표기. 규칙을 여기서만 느슨하게 하면 규칙이 두 벌이 된다.
 *
 * 다시 돌려도 안전하다: 이미 사진이 있는 것은 건너뛴다.
 */
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@shop/db';
import { imageObjectKey, verifyImageBytes } from '@shop/core';
import { makeBlur } from '../src/lib/images/blur';

const ACCESS_KEY = process.env['UNSPLASH_ACCESS_KEY'];

/** 어느 기획전에 어떤 사진을 깔지. 담긴 상품은 DB 시드가 정한다. */
const COLLECTION_PHOTOS: Readonly<Record<string, string>> = {
  'winter-outer': 'winter coat street style',
  'everyday-knit': 'knitwear minimal fashion',
};

/** 지금 카테고리를 가리키는 배너를 어느 기획전으로 돌릴지. */
const BANNER_LINKS: Readonly<Record<string, { slug: string; photo: string }>> = {
  '/category/outer': { slug: 'winter-outer', photo: 'wool coat winter editorial' },
  '/category/knit': { slug: 'everyday-knit', photo: 'knit sweater editorial' },
};

interface UnsplashPhoto {
  readonly id: string;
  readonly urls: { readonly raw: string };
  readonly links: { readonly download_location: string };
  readonly user: { readonly name: string; readonly links: { readonly html: string } };
}

const auth = { Authorization: `Client-ID ${ACCESS_KEY ?? ''}` };

async function search(query: string): Promise<UnsplashPhoto[]> {
  const url = new URL('https://api.unsplash.com/search/photos');
  url.searchParams.set('query', query);
  // 배너와 기획전 머리는 가로로 넓은 자리다. 상품 카드와 방향이 다르다.
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', '10');
  url.searchParams.set('content_filter', 'high');

  const response = await fetch(url, { headers: auth });
  if (!response.ok) throw new Error(`Unsplash 검색 실패 (${response.status}) — ${query}`);
  const body = (await response.json()) as { results: UnsplashPhoto[] };
  return body.results;
}

/** 다운로드 집계를 알린다. API 가이드라인이 요구한다. 실패해도 멈추지 않는다. */
async function reportDownload(photo: UnsplashPhoto): Promise<void> {
  try {
    await fetch(photo.links.download_location, { headers: auth });
  } catch (error) {
    console.warn('  다운로드 집계 실패(무시)', photo.id, error);
  }
}

/** 히어로에 쓰기 좋은 가로 크기로 받는다. */
async function download(photo: UnsplashPhoto): Promise<Buffer> {
  const url = new URL(photo.urls.raw);
  url.searchParams.set('w', '1920');
  url.searchParams.set('h', '900');
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

/** 어느 DB·버킷을 건드리는지 먼저 밝힌다. 이 프로젝트에서 두 번 당한 자리다. */
function announceTarget(): void {
  let where = '(DATABASE_URL 없음)';
  try {
    where = new URL(process.env['DATABASE_URL'] ?? '').host;
  } catch {
    // 형식이 이상해도 여기서 멈추지 않는다. Prisma 가 곧 제대로 된 오류를 낸다.
  }
  console.log(`DB     : ${where}`);
  console.log(`저장소 : ${bucket || '(S3_BUCKET 없음)'} → ${publicBase || '(공개 주소 없음)'}\n`);
}

/** 사진 한 장을 받아 저장소에 올리고 주소·출처를 돌려준다. */
async function fetchHero(
  query: string,
  keyOwner: string,
  used: Set<string>,
): Promise<{ url: string; key: string; credit: string; blurDataUrl: string | null } | null> {
  const candidates = (await search(query)).filter((p) => !used.has(p.id));
  const photo = candidates[0];
  if (!photo) {
    console.warn(`  후보 없음 — ${query}`);
    return null;
  }
  used.add(photo.id);

  const bytes = await download(photo);
  // 업로드 경로와 같은 규칙으로 검사한다. 여기만 느슨하면 규칙이 두 벌이 된다.
  const contentType = verifyImageBytes({ bytes, declaredType: 'image/jpeg' });
  const key = imageObjectKey({
    // 버킷 정책이 products/ 만 공개하므로 접두사를 맞춘다
    productId: keyOwner,
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
  await reportDownload(photo);

  return {
    url: `${publicBase}/${key}`,
    key,
    credit: `Photo: ${photo.user.name} / Unsplash`,
    // 받아 온 바이트가 여기 있다. 나중에 주소로 다시 받는 것보다 싸다.
    blurDataUrl: await makeBlur(bytes),
  };
}

async function main(): Promise<void> {
  announceTarget();
  if (!ACCESS_KEY) {
    console.error(
      'UNSPLASH_ACCESS_KEY 가 없습니다.\n' +
        'https://unsplash.com/oauth/applications/new 에서 앱을 만들고 Access Key 를 .env 에 넣어 주세요.',
    );
    process.exit(1);
  }
  const used = new Set<string>();

  for (const [slug, query] of Object.entries(COLLECTION_PHOTOS)) {
    const collection = await prisma.collection.findUnique({
      where: { slug },
      select: { id: true, title: true, imageUrl: true },
    });
    if (!collection) {
      console.warn(`없는 기획전 ${slug} — pnpm db:seed 를 먼저 돌려 주세요`);
      continue;
    }
    if (collection.imageUrl) {
      console.log(`건너뜀 ${collection.title} — 이미 사진이 있음`);
      continue;
    }

    const hero = await fetchHero(query, `collection-${slug}`, used);
    if (!hero) continue;

    await prisma.collection.update({
      where: { id: collection.id },
      data: {
        imageUrl: hero.url, storageKey: hero.key, blurDataUrl: hero.blurDataUrl,
        imageCredit: hero.credit, imageAlt: '',
      },
    });
    console.log(`${collection.title} — 사진 1장`);
  }

  /*
   * 배너를 기획전으로 돌린다.
   *
   * 문구로 짝을 짓지 않고 **지금 링크가 가리키는 카테고리**로 찾는다 —
   * 운영자가 문구를 고쳤을 수 있고, 그때 짝이 조용히 어긋나면 배너가 엉뚱한
   * 곳으로 간다.
   */
  for (const [href, link] of Object.entries(BANNER_LINKS)) {
    const banners = await prisma.banner.findMany({
      where: { href },
      select: { id: true, imageUrl: true, headline: true },
    });

    for (const banner of banners) {
      const hero =
        banner.imageUrl === null ? await fetchHero(link.photo, `banner-${banner.id}`, used) : null;

      await prisma.banner.update({
        where: { id: banner.id },
        data: {
          href: `/collection/${link.slug}`,
          ...(hero
            ? {
                imageUrl: hero.url, storageKey: hero.key, blurDataUrl: hero.blurDataUrl,
                imageCredit: hero.credit, imageAlt: '',
              }
            : {}),
        },
      });
      console.log(
        `배너 「${banner.headline.replace(/\n/g, ' ')}」 → /collection/${link.slug}` +
          (hero ? ' · 사진 1장' : ''),
      );
    }
  }
}

await main();
await prisma.$disconnect();
