import 'dotenv/config';
import { prisma } from './client';

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
  discountPercent: number;
  colors: { value: string; hex: string }[];
  sizes: string[];
  /** 사이즈별 재고. 없는 사이즈는 0(품절)으로 둔다. */
  stock: Record<string, number>;
  rating: number;
  reviewCount: number;
  soldCount: number;
}

const PRODUCTS: SeedProduct[] = [
  {
    slug: 'oversized-wool-coat', name: '오버사이즈 울 블렌드 코트',
    description: '이탈리아산 울을 62% 혼방해 무게감은 덜고 보온성은 유지했습니다. 어깨선을 낮춘 오버핏이라 두꺼운 니트를 이너로 입어도 당기지 않고, 무릎 살짝 위 기장으로 코트 특유의 부담스러움을 덜었습니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-coat',
    listPrice: 413_000, discountPercent: 30,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }, { value: '블랙', hex: '#181613' }],
    sizes: ['S', 'M', 'L', 'XL'],
    stock: { S: 4, M: 12, L: 0, XL: 7 },
    rating: 4.8, reviewCount: 1204, soldCount: 3120,
  },
  {
    slug: 'short-padding-blouson', name: '숏 패딩 블루종',
    description: '가벼운 구스 충전재에 짧은 기장. 슬랙스에도 무리 없이 어울립니다.',
    brandSlug: 'studio-noon', categorySlug: 'outer-padding',
    listPrice: 198_000, discountPercent: 0,
    colors: [{ value: '블랙', hex: '#181613' }, { value: '아이보리', hex: '#F0EBE2' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 30, M: 52, L: 30 },
    rating: 4.6, reviewCount: 318, soldCount: 640,
  },
  {
    slug: 'lambswool-crewneck', name: '램스울 크루넥 니트',
    description: '램스울 100%. 목둘레를 좁게 잡아 이너로 입기 편합니다.',
    brandSlug: 'atelier-k', categorySlug: 'knit-crewneck',
    listPrice: 129_000, discountPercent: 0,
    colors: [{ value: '차콜', hex: '#45423E' }, { value: '오트밀', hex: '#E6DFD3' }],
    sizes: ['M', 'L'],
    stock: { M: 4, L: 18 },
    rating: 4.9, reviewCount: 876, soldCount: 2140,
  },
  {
    slug: 'wool-double-jacket', name: '울 더블 브레스티드 자켓',
    description: '허리선을 잡아 준 더블 브레스티드. 안감까지 울로 마감했습니다.',
    brandSlug: 'atelier-k', categorySlug: 'outer-jacket',
    listPrice: 246_000, discountPercent: 0,
    colors: [{ value: '네이비', hex: '#2A3242' }],
    sizes: ['S', 'M', 'L'],
    stock: { S: 0, M: 0, L: 0 },
    rating: 4.9, reviewCount: 512, soldCount: 980,
  },
  {
    slug: 'cotton-twill-wide-pants', name: '코튼 트윌 와이드 팬츠',
    description: '두께감 있는 코튼 트윌. 밑단이 접히지 않게 기장을 넉넉히 뒀습니다.',
    brandSlug: 'moor', categorySlug: 'pants-wide',
    listPrice: 89_000, discountPercent: 20,
    colors: [{ value: '베이지', hex: '#D9CEC4' }, { value: '블랙', hex: '#181613' }],
    sizes: ['28', '30', '32', '34'],
    stock: { '28': 40, '30': 88, '32': 76, '34': 42 },
    rating: 4.6, reviewCount: 2318, soldCount: 5240,
  },
  {
    slug: 'cable-knit-muffler', name: '케이블 니트 머플러',
    description: '울 혼방 케이블 니트. 한 바퀴 감아도 부하지 않은 두께입니다.',
    brandSlug: 'moor', categorySlug: 'accessory',
    listPrice: 68_000, discountPercent: 0,
    colors: [{ value: '오트밀', hex: '#E6DFD3' }, { value: '차콜', hex: '#45423E' }],
    sizes: ['FREE'],
    stock: { FREE: 120 },
    rating: 4.5, reviewCount: 327, soldCount: 810,
  },
  {
    slug: 'heavy-cotton-hoodie', name: '헤비 코튼 후디 · 차콜',
    description: '480g 헤비 코튼. 세탁 후에도 형태가 무너지지 않습니다.',
    brandSlug: 'plain-label', categorySlug: 'knit-crewneck',
    listPrice: 98_000, discountPercent: 0,
    colors: [{ value: '차콜', hex: '#45423E' }],
    sizes: ['M', 'L', 'XL'],
    stock: { M: 25, L: 41, XL: 19 },
    rating: 4.7, reviewCount: 1041, soldCount: 2380,
  },
  {
    slug: 'washed-denim-straight', name: '워시드 데님 스트레이트',
    description: '중청 워싱에 스트레이트 실루엣. 신축성 없는 원단입니다.',
    brandSlug: 'plain-label', categorySlug: 'pants-straight',
    listPrice: 112_000, discountPercent: 0,
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
        discountPercent: p.discountPercent, brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        ratingSum: Math.round(p.rating * p.reviewCount),
        reviewCount: p.reviewCount, soldCount: p.soldCount,
        publishedAt: new Date('2026-07-01T00:00:00Z'),
      },
      create: {
        slug: p.slug, name: p.name, description: p.description,
        listPrice: p.listPrice, discountPercent: p.discountPercent,
        brandId: brand.id, categoryId: category.id,
        status: totalStock === 0 ? 'SOLD_OUT' : 'ACTIVE',
        ratingSum: Math.round(p.rating * p.reviewCount),
        reviewCount: p.reviewCount, soldCount: p.soldCount,
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

  // ── 데모 계정
  const user = await prisma.user.upsert({
    where: { email: 'demo@plain.test' },
    update: {},
    create: {
      email: 'demo@plain.test', name: '데모 사용자', phone: '010-0000-0000',
      grade: 'GOLD', pointBalance: 3_240, emailVerified: true,
    },
  });
  await prisma.address.upsert({
    where: { id: `${user.id}-default` },
    update: {},
    create: {
      id: `${user.id}-default`, userId: user.id, label: '집',
      recipient: '데모 사용자', phone: '010-0000-0000',
      postalCode: '04766', address1: '서울 성동구 왕십리로 000',
      address2: '101동 1102호', isDefault: true,
    },
  });
  console.log('  데모 계정 1개 (demo@plain.test)');

  console.log('시드 완료');
}

main()
  .catch((e: unknown) => {
    console.error('시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
