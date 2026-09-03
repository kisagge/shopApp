/**
 * 상품 플레이스홀더 이미지 시드.
 *
 * 외부에서 사진을 받아 오지 않는다. 남의 사진을 저장소에 넣어 두면 나중에
 * 출처를 설명할 수 없고, 포트폴리오로 공개할 때 그대로 문제가 된다.
 * 여기서 만드는 것은 PLAIN 팔레트의 톤 블록이라 **명백히 플레이스홀더**다.
 *
 * 키 생성과 대체 텍스트 규칙은 @shop/core 의 것을 그대로 쓴다.
 * 업로드 경로와 시드가 서로 다른 규칙을 쓰면 언젠가 어긋난다.
 */
import { randomBytes } from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
// 앱이 쓰는 것과 같은 클라이언트를 가져온다. 여기서 새로 만들면
// 어댑터 설정이 두 벌이 되고, 실제로 pnpm 이 @prisma/adapter-pg 를
// 이 앱에서 해석하지 못해 실패한다.
import { prisma } from '@shop/db';
import { imageObjectKey, defaultAlt } from '@shop/core';
import { placeholder, TONES } from './make-png.mjs';

const TONE_NAMES = Object.keys(TONES);

const endpoint = process.env['S3_ENDPOINT'];
const s3 = new S3Client({
  region: process.env['S3_REGION'] ?? 'us-east-1',
  // exactOptionalPropertyTypes 아래에서는 undefined 를 명시적으로 넘길 수 없다.
  // 값이 없으면 키 자체를 빼야 SDK 가 기본 엔드포인트를 쓴다.
  ...(endpoint ? { endpoint } : {}),
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env['S3_ACCESS_KEY_ID'] ?? '',
    secretAccessKey: process.env['S3_SECRET_ACCESS_KEY'] ?? '',
  },
});
const bucket = process.env['S3_BUCKET'] ?? '';
const publicBase = (process.env['S3_PUBLIC_BASE_URL'] ?? '').replace(/\/+$/, '');

async function main(): Promise<void> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, name: true,
      brand: { select: { name: true } },
      _count: { select: { images: true } },
    },
  });

  let created = 0;

  for (const [index, product] of products.entries()) {
    if (product._count.images > 0) {
      console.log(`건너뜀 ${product.name} — 이미 ${product._count.images}장`);
      continue;
    }

    // 상품마다 다른 톤을 돌려 쓰면 목록이 단조롭지 않다
    const tone = TONE_NAMES[index % TONE_NAMES.length];

    for (let i = 0; i < 2; i += 1) {
      const png: Buffer = placeholder({ tone, variant: i, width: 800, height: 1000 });
      const key = imageObjectKey({
        productId: product.id,
        contentType: 'image/png',
        token: randomBytes(12).toString('base64url'),
      });

      await s3.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: png,
        ContentType: 'image/png',
        CacheControl: 'public, max-age=31536000, immutable',
      }));

      await prisma.productImage.create({
        data: {
          productId: product.id,
          url: `${publicBase}/${key}`,
          storageKey: key,
          sortOrder: i,
          alt: defaultAlt({
            brandName: product.brand.name,
            productName: product.name,
            index: i,
          }),
        },
      });
      created += 1;
    }

    console.log(`${product.brand.name} ${product.name} — ${tone} 2장`);
  }

  console.log(`\n총 ${created}장 생성`);
  await prisma.$disconnect();
}

await main();
