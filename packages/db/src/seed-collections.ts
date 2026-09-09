import { prisma } from './client';

/**
 * 기획전 시드.
 *
 * **진짜 사진은 넣지 않는다.** 사진은 바깥(Unsplash)과 저장소가 있어야
 * 하는데 CI 에는 둘 다 없다. 여기서 만드는 것은 구조 — 어떤 묶음이 있고
 * 무엇이 담겼는지 — 이고, 진짜 사진은 `pnpm --filter @shop/web
 * seed:collections` 가 나중에 덮는다.
 *
 * 카테고리·브랜드·쿠폰과 같은 자리다. 이것이 없으면 **CI 가 기획전 화면을
 * 한 번도 지나가지 않는다.**
 *
 * **대신 자리표시 한 장을 건다.** 사진이 아예 없으면 화면에 <img> 가 안
 * 그려지고, 그러면 "표시 크기가 자리에 맞는가" 같은 검사가 볼 것이 없어
 * 조용히 건너뛴다 — 매 CI 실행의 "2 skipped" 가 그것이었다. 앱 안에
 * 들어 있는 파일이라 바깥도 저장소도 필요 없다.
 */
const PLACEHOLDER_IMAGE = '/seed/collection.png';
const COLLECTIONS = [
  {
    slug: 'winter-outer',
    title: '겨울을 오래 입는 방법',
    subtitle: '한 벌로 계절을 나는 아우터',
    description:
      '소재와 무게, 그리고 오래 두고 입을 만한 실루엣을 기준으로 골랐습니다.\n한 철 입고 마는 옷이 아니라, 몇 해를 함께 나는 옷을 찾는 분께.',
    tone: 'sand',
    productSlugs: [
      'oversized-wool-coat',
      'wool-double-jacket',
      'short-padding-blouson',
      'cable-knit-muffler',
    ],
  },
  {
    slug: 'everyday-knit',
    title: '매일 입는 니트',
    subtitle: '보풀이 덜 생기는 조직과 실',
    description: '세탁 후에도 처음의 두께를 지킵니다. 매일 손이 가는 자리에 두고 입는 것들.',
    tone: 'olive',
    productSlugs: ['lambswool-crewneck', 'cable-knit-muffler', 'heavy-cotton-hoodie'],
  },
] as const;

export async function seedCollections(): Promise<void> {
  for (const [index, spec] of COLLECTIONS.entries()) {
    const products = await prisma.product.findMany({
      where: { slug: { in: [...spec.productSlugs] } },
      select: { id: true, slug: true },
    });
    const idOf = new Map(products.map((p) => [p.slug, p.id]));

    const items = spec.productSlugs.flatMap((slug, sortOrder) => {
      const productId = idOf.get(slug);
      return productId ? [{ productId, sortOrder }] : [];
    });

    /*
     * 다시 돌려도 같은 결과가 되게 담긴 줄을 새로 쓴다. 얹기만 하면 상품
     * 순서를 바꾼 뒤 시드를 돌렸을 때 옛 순서가 남는다.
     */
    const collection = await prisma.collection.upsert({
      where: { slug: spec.slug },
      update: {
        title: spec.title,
        subtitle: spec.subtitle,
        description: spec.description,
        tone: spec.tone,
        sortOrder: index,
        // 사진은 건드리지 않는다 — 진짜 사진이 올라가 있으면 그대로 둔다
      },
      create: {
        slug: spec.slug,
        title: spec.title,
        subtitle: spec.subtitle,
        description: spec.description,
        tone: spec.tone,
        sortOrder: index,
        isActive: true,
        imageUrl: PLACEHOLDER_IMAGE,
        imageAlt: '',
      },
      select: { id: true },
    });

    await prisma.$transaction([
      prisma.collectionItem.deleteMany({ where: { collectionId: collection.id } }),
      prisma.collectionItem.createMany({
        data: items.map((i) => ({ ...i, collectionId: collection.id })),
      }),
    ]);
  }

  console.log(`  기획전 ${COLLECTIONS.length}개`);
}
