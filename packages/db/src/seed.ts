import { resolve } from 'node:path';
import { config } from 'dotenv';

// 모노레포 루트의 .env 를 읽는다 (cwd 는 packages/db)
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { prisma } from './client';
import { seedReviews } from './seed-reviews';
import { seedSupport } from './seed-support';
import { seedCollections } from './seed-collections';

/**
 * 개발용 시드. 여러 번 돌려도 같은 상태가 되도록 전부 upsert 로 쓴다.
 * 시안(design/)에 나오는 상품과 같은 데이터라 화면을 붙일 때 눈으로 대조하기 쉽다.
 */

const CATEGORIES = [
  { slug: 'outer', name: '아우터', children: [
    { slug: 'outer-coat', name: '코트' },
    { slug: 'outer-padding', name: '패딩' },
    { slug: 'outer-jacket', name: '자켓' },
    { slug: 'outer-blouson', name: '블루종' },
  ]},
  { slug: 'knit', name: '니트', children: [
    { slug: 'knit-crewneck', name: '크루넥' },
    { slug: 'knit-cardigan', name: '가디건' },
  ]},
  { slug: 'pants', name: '팬츠', children: [
    { slug: 'pants-wide', name: '와이드' },
    { slug: 'pants-straight', name: '스트레이트' },
  ]},
  { slug: 'shoes', name: '슈즈', children: [] },
  { slug: 'accessory', name: '액세서리', children: [] },
];

/// 가맹점. PLAIN LABEL 은 자사 브랜드라 가맹점에 속하지 않는다(merchantId = null).
/// 자사 상품은 가맹점이 건드릴 수 없고 운영진만 다룬다 — authz 의 ownsMerchant 참고.
const MERCHANTS = [
  {
    name: '스튜디오눈', businessName: '주식회사 스튜디오눈',
    businessNumber: '000-00-00001', representative: '[대표자명]',
    contactEmail: 'contact@studionoon.test', contactPhone: '02-0000-0001',
    commissionPercent: 15, brands: ['studio-noon'],
  },
  {
    name: '아뜰리에케이', businessName: '아뜰리에케이',
    businessNumber: '000-00-00002', representative: '[대표자명]',
    contactEmail: 'contact@atelierk.test', contactPhone: '02-0000-0002',
    commissionPercent: 18, brands: ['atelier-k'],
  },
  {
    name: '무어', businessName: '무어컴퍼니',
    businessNumber: '000-00-00003', representative: '[대표자명]',
    contactEmail: 'contact@moor.test', contactPhone: '02-0000-0003',
    commissionPercent: 12, brands: ['moor'],
  },
];

const BRANDS = [
  { slug: 'studio-noon', name: 'STUDIO NOON' },
  { slug: 'atelier-k', name: 'ATELIER K' },
  { slug: 'moor', name: 'MOOR' },
  { slug: 'plain-label', name: 'PLAIN LABEL' },
];

interface SeedProduct {
  slug: string;
  name: string;
  description: string;
  brandSlug: string;
  categorySlug: string;
  listPrice: number;
  /** 실제 판매가. null 이면 정가 판매 */
  salePrice: number | null;
  colors: { value: string; hex: string }[];
  sizes: string[];
  /** 사이즈별 재고. 없는 사이즈는 0(품절)으로 둔다. */
  stock: Record<string, number>;
  /**
   * 평점은 시드하지 않는다.
   *
   * 집계 컬럼(ratingSum·reviewCount·ratingScore)의 진실은 reviews 테이블이고,
   * 리뷰를 쓸 때마다 원본을 다시 세어 갱신한다. 뒷받침하는 행 없이 숫자만
   * 넣어 두면 첫 리뷰가 그 숫자를 덮어써 갑자기 떨어진다.
   *
   * 두 값은 상품 정의에 남겨 두었지만 DB 에 넣지 않는다 — 나중에 실제 리뷰를
   * 시드할 때 목표치로 쓸 수 있다.
   */
  rating: number;
  reviewCount: number;
  soldCount: number;
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'oversized-wool-coat', name: '오버사이즈 울 블렌드 코트',
    description: '이탈리아산 울을 62% 혼방해 무게감은 덜고 보온성은 유지했습니다. 어깨선을 낮춘 오버핏이라 두꺼운 니트를 이너로 입어도 당기지 않고, 무릎 살짝 위 기장으로 코트 특유의 부담스러움을 덜었습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-coat',
    listPrice: 413_000, salePrice: 289_000,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }, { value: '블랙', hex: '#181613' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 4, M: 12, L: 0, XL: 7 },
    rating: 4.8, reviewCount: 1204, soldCount: 3120,
  },
  {
    slug: 'short-padding-blouson', name: '숏 패딩 블루종',
    description: '가벼운 구스 충전재에 짧은 기장. 슬랙스에도 무리 없이 어울립니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-padding',
    listPrice: 198_000, salePrice: null,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '아이보리', hex: '#F0EBE2' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 30, M: 52, L: 30 },
    rating: 4.6, reviewCount: 318, soldCount: 640,
  },
  {
    slug: 'lambswool-crewneck', name: '램스울 크루넥 니트',
    description: '램스울 100%. 목둘레를 좁게 잡아 이너로 입기 편합니다.',
    brandSlug: 'atelier-k', categorySlug: 'knit-crewneck',
    listPrice: 129_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '오트밀', hex: '#E6DFD3' }],
    sizes: ['M', 'L'],
    stock: { M: 4, L: 18 },
    rating: 4.9, reviewCount: 876, soldCount: 2140,
  },
  {
    slug: 'wool-double-jacket', name: '울 더블 브레스티드 자켓',
    description: '허리선을 잡아 준 더블 브레스티드. 안감까지 울로 마감했습니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-jacket',
    listPrice: 246_000, salePrice: null,
    colors: [{ value: '네이비', hex: '#2A3242' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 0, M: 0, L: 0 },
    rating: 4.9, reviewCount: 512, soldCount: 980,
  },
  {
    slug: 'cotton-twill-wide-pants', name: '코튼 트윌 와이드 팬츠',
    description: '두께감 있는 코튼 트윌. 밑단이 접히지 않게 기장을 넉넉히 뒀습니다.',
    brandSlug: 'moor', categorySlug: 'pants-wide',
    listPrice: 89_000, salePrice: 71_000,
    colors: [{ value: '베이지', hex: '#D9CEC4' }, { value: '블랙', hex: '#181613' }],
    sizes: ['28', '30', '32', '34'],
    stock: { '28': 40, '30': 88, '32': 76, '34': 42 },
    rating: 4.6, reviewCount: 2318, soldCount: 5240,
  },
  {
    slug: 'cable-knit-muffler', name: '케이블 니트 머플러',
    description: '울 혼방 케이블 니트. 한 바퀴 감아도 부하지 않은 두께입니다.',
    brandSlug: 'moor', categorySlug: 'accessory',
    listPrice: 68_000, salePrice: null,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['FREE'],
    stock: { FREE: 120 },
    rating: 4.5, reviewCount: 327, soldCount: 810,
  },
  {
    slug: 'heavy-cotton-hoodie', name: '헤비 코튼 후디 · 차콜',
    description: '480g 헤비 코튼. 세탁 후에도 형태가 무너지지 않습니다.',
    brandSlug: 'plain-label', categorySlug: 'knit-crewneck',
    listPrice: 98_000, salePrice: null,
    colors: [{ value: '차콜', hex: '#45423E' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 25, L: 41, XL: 19 },
    rating: 4.7, reviewCount: 1041, soldCount: 2380,
  },
  {
    slug: 'washed-denim-straight', name: '워시드 데님 스트레이트',
    description: '중청 워싱에 스트레이트 실루엣. 신축성 없는 원단입니다.',
    brandSlug: 'plain-label', categorySlug: 'pants-straight',
    listPrice: 112_000, salePrice: null,
    colors: [{ value: '인디고', hex: '#3A4A63' }],
    sizes: ['28', '30', '32'],
    stock: { '28': 22, '30': 35, '32': 28 },
    rating: 4.4, reviewCount: 211, soldCount: 470,
  },
];

async function main(): Promise<void> {
  console.log('시드 시작');

  // ── 카테고리 (부모 먼저, 자식 나중)
  for (const [i, c] of CATEGORIES.entries()) {
    const parent = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, sortOrder: i },
      create: { slug: c.slug, name: c.name, sortOrder: i },
    });
    for (const [j, child] of c.children.entries()) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, parentId: parent.id, sortOrder: j },
        create: { slug: child.slug, name: child.name, parentId: parent.id, sortOrder: j },
      });
    }
  }
  console.log(`  카테고리 ${CATEGORIES.length}개 (하위 포함)`);

  // ── 브랜드
  for (const b of BRANDS) {
    await prisma.brand.upsert({
      where: { slug: b.slug }, update: { name: b.name }, create: b,
    });
  }
  console.log(`  브랜드 ${BRANDS.length}개`);
  // ── 가맹점 + 브랜드 연결
  for (const m of MERCHANTS) {
    const { brands, ...data } = m;
    const merchant = await prisma.merchant.upsert({
      where: { businessNumber: m.businessNumber },
      update: { status: 'APPROVED', approvedAt: new Date('2026-01-15T00:00:00Z') },
      create: { ...data, status: 'APPROVED', approvedAt: new Date('2026-01-15T00:00:00Z') },
    });
    await prisma.brand.updateMany({
      where: { slug: { in: brands } },
      data: { merchantId: merchant.id },
    });
  }
  console.log(`  가맹점 ${MERCHANTS.length}개 (PLAIN LABEL 은 자사 브랜드)`);


  // ── 상품 · 옵션 · 변형
  let variantCount = 0;
  for (const p of PRODUCTS) {
    const brand = await prisma.brand.findUniqueOrThrow({ where: { slug: p.brandSlug } });
    const category = await prisma.category.findUniqueOrThrow({ where: { slug: p.categorySlug } });

    const totalStock = Object.values(p.stock).reduce((a, b) => a + b, 0);
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        name: p.name, description: p.description, listPrice: p.listPrice,
        salePrice: p.salePrice, brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        // 평점 집계는 여기서 건드리지 않는다. reviews 테이블이 진실이고
        // seedReviews 가 원본을 세어 채운다. 여기서 0 으로 되돌리면
        // 시드를 두 번 돌렸을 때 이미 쌓인 리뷰의 집계가 사라진다.
        soldCount: p.soldCount,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      },
      create: {
        slug: p.slug, name: p.name, description: p.description,
        listPrice: p.listPrice, salePrice: p.salePrice,
        brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        // 평점은 0 에서 시작한다. 뒷받침하는 Review 행 없이 숫자만 넣으면
        // 첫 리뷰가 그 숫자를 덮어써 "리뷰 2,318개" 가 갑자기 1개가 된다.
        ratingSum: 0, reviewCount: 0,
        soldCount: p.soldCount,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      },
    });

    const colorGroup = await prisma.productOptionGroup.upsert({
      where: { productId_name: { productId: product.id, name: '색상' } },
      update: { sortOrder: 0 },
      create: { productId: product.id, name: '색상', sortOrder: 0 },
    });
    const sizeGroup = await prisma.productOptionGroup.upsert({
      where: { productId_name: { productId: product.id, name: '사이즈' } },
      update: { sortOrder: 1 },
      create: { productId: product.id, name: '사이즈', sortOrder: 1 },
    });

    for (const [i, c] of p.colors.entries()) {
      await prisma.productOptionValue.upsert({
        where: { groupId_value: { groupId: colorGroup.id, value: c.value } },
        update: { swatchHex: c.hex, sortOrder: i },
        create: { groupId: colorGroup.id, value: c.value, swatchHex: c.hex, sortOrder: i },
      });
    }
    for (const [i, s] of p.sizes.entries()) {
      await prisma.productOptionValue.upsert({
        where: { groupId_value: { groupId: sizeGroup.id, value: s } },
        update: { sortOrder: i },
        create: { groupId: sizeGroup.id, value: s, sortOrder: i },
      });
    }

    // 색상 × 사이즈 전 조합을 SKU로 만든다
    for (const color of p.colors) {
      const colorValue = await prisma.productOptionValue.findUniqueOrThrow({
        where: { groupId_value: { groupId: colorGroup.id, value: color.value } },
      });
      for (const size of p.sizes) {
        const sizeValue = await prisma.productOptionValue.findUniqueOrThrow({
          where: { groupId_value: { groupId: sizeGroup.id, value: size } },
        });
        const sku = `${p.slug}-${color.value}-${size}`.toUpperCase().replace(/\s+/g, '');
        await prisma.productVariant.upsert({
          where: { sku },
          update: {
            label: `${color.value} / ${size}`,
            stock: p.stock[size] ?? 0,
            isActive: true,
            optionValues: { set: [{ id: colorValue.id }, { id: sizeValue.id }] },
          },
          create: {
            sku, productId: product.id,
            label: `${color.value} / ${size}`,
            stock: p.stock[size] ?? 0,
            optionValues: { connect: [{ id: colorValue.id }, { id: sizeValue.id }] },
          },
        });
        variantCount += 1;
      }
    }
  }
  console.log(`  상품 ${PRODUCTS.length}개 · 변형 ${variantCount}개`);

  // ── 쿠폰
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10000' },
    update: {},
    create: {
      code: 'WELCOME10000', name: '신규회원 10,000원 할인', kind: 'AMOUNT',
      value: 10_000, minimumOrder: 30_000,
      startsAt: new Date('2026-01-01T00:00:00Z'),
      endsAt: new Date('2026-12-31T23:59:59Z'),
    },
  });
  await prisma.coupon.upsert({
    where: { code: 'AUTUMN20' },
    update: {},
    create: {
      code: 'AUTUMN20', name: '가을 아우터 20% (최대 3만원)', kind: 'PERCENT',
      percent: 20, maxDiscount: 30_000, minimumOrder: 50_000,
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-11-30T23:59:59Z'),
    },
  });
  console.log('  쿠폰 2개');

  // 계정은 @shop/auth 의 시드가 만든다. 비밀번호 해시를 여기서 흉내 내지 않고
  // 실제 가입 API 를 호출하기 위해서다. pnpm db:seed 가 두 단계를 이어서 돌린다.

  await seedCollections();

  await seedSupport();

  await seedReviews();

  console.log('시드 완료');
}

main()
  .catch((e: unknown) => {
    console.error('시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
