/**
 * 리뷰 시드 — **실제 Review 행을 만든다.**
 *
 * 상품의 평점 집계(ratingSum·reviewCount·ratingScore)는 reviews 테이블이
 * 진실이고, 리뷰를 쓸 때마다 원본을 다시 세어 갱신한다. 그래서 뒷받침하는
 * 행 없이 숫자만 넣어 두면 첫 리뷰 하나가 "리뷰 2,318개" 를 1개로 덮어쓴다.
 * 실제로 그렇게 겪고 이 파일을 만들었다.
 *
 * 리뷰는 주문 항목에 달리므로 **주문 이력도 함께 만든다.** 우회로가 없다 —
 * orderItemId 가 곧 "이 구매" 의 신원이기 때문이다.
 *
 * 무작위를 쓰지 않고 고정 시드 난수를 쓴다. 여러 번 돌려도 같은 데이터가
 * 나와야 화면을 비교하며 개발할 수 있다.
 */
import { prisma } from './client';

/** 고정 시드 선형 합동 생성기. Math.random 을 쓰면 매번 다른 데이터가 나온다. */
function makeRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return state / 4_294_967_296;
  };
}

const REVIEWERS = [
  '김서연', '이준호', '박지민', '최유진', '정민우', '강하늘',
  '조은지', '윤태영', '임수빈', '한소영', '오재현', '신다인',
];

/** 카테고리 결에 맞는 문장들. 조합해 쓰므로 같은 글이 반복되지 않는다. */
const OPENERS = [
  '사진보다 실물이 낫습니다.',
  '고민하다 샀는데 잘한 선택이었어요.',
  '두 번째 구매입니다.',
  '배송이 생각보다 빨랐습니다.',
  '가격대를 생각하면 만족스럽습니다.',
  '선물용으로 샀는데 반응이 좋았어요.',
];

const BODIES: Readonly<Record<string, readonly string[]>> = {
  outer: [
    '기모가 들어간 것도 아닌데 생각보다 따뜻합니다.',
    '어깨선이 잘 떨어져서 안에 니트를 입어도 붕 뜨지 않아요.',
    '무게가 있는 편이라 오래 입고 다니면 어깨가 좀 눌립니다.',
    '안감 마감이 깔끔하고 단추도 튼튼합니다.',
  ],
  knit: [
    '세탁 두 번 했는데 아직 보풀이 안 올라왔습니다.',
    '목이 늘어나지 않아서 좋아요.',
    '얇아 보이는데 생각보다 따뜻합니다.',
    '살에 닿는 느낌이 부드러워서 이너 없이도 입습니다.',
  ],
  pants: [
    '허리가 편하고 밑위가 길어서 앉아 있어도 배기지 않아요.',
    '기장이 딱 맞아서 수선 없이 입었습니다.',
    '워싱이 사진이랑 거의 같습니다.',
    '한 번 빨았더니 살짝 줄어든 느낌이 있어요.',
  ],
  shoes: [
    '처음엔 조금 뻣뻣했는데 며칠 신으니 발에 맞습니다.',
    '밑창이 두꺼워서 오래 걸어도 발이 덜 아파요.',
    '발볼이 넓은 편이라 반 사이즈 크게 샀습니다.',
  ],
  accessory: [
    '색이 은은해서 어디에나 잘 어울립니다.',
    '두께가 적당해서 봄가을에 쓰기 좋아요.',
    '포장이 깔끔해서 선물하기 좋았습니다.',
  ],
};

const CLOSERS = [
  '',
  '다음에 다른 색도 사려고요.',
  '추천합니다.',
  '재구매 의사 있습니다.',
  '다만 색은 화면보다 조금 어둡습니다.',
];

/**
 * 별점 분포.
 *
 * 전부 5점이면 거짓말처럼 보인다. 실제 커머스의 분포에 가깝게
 * 5점이 가장 많고 낮은 점수가 드물게 섞이도록 둔다.
 */
const RATING_POOL = [5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4, 4, 3, 3, 2];
const SIZE_FIT_POOL = ['TRUE', 'TRUE', 'TRUE', 'TRUE', 'LARGE', 'SMALL', null];

function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.floor(random() * list.length)] as T;
}

/**
 * 순서대로 돌려 쓴다.
 *
 * 무작위로 고르면 한 상품 안에서 같은 문장이 서너 번 겹친다 — 8건 중
 * 같은 첫 문장이 4번 나온 적이 있다. 목록을 훑는 사람 눈에는 그게 바로
 * 기계가 쓴 글로 보인다. 시작 지점만 상품마다 달리하고 이후는 한 칸씩 민다.
 */
function rotate<T>(list: readonly T[], index: number, offset: number): T {
  return list[(index + offset) % list.length] as T;
}

/** 상품 카테고리 슬러그에서 문장 묶음을 고른다. 모르는 카테고리는 아우터로. */
function bodiesFor(categorySlug: string): readonly string[] {
  const root = categorySlug.split('-')[0] ?? '';
  return BODIES[root] ?? BODIES['outer'] ?? [];
}

export async function seedReviews(): Promise<void> {
  const random = makeRandom(20260901);

  // 리뷰어 계정. **로그인용 Account 를 만들지 않는다** — 시드가 비밀번호
  // 해시를 흉내 내지 않기 위해서다(실제 계정은 @shop/auth 시드가 만든다).
  // 이 사람들은 과거에 사고 후기를 남긴 기록으로만 존재한다.
  const reviewers = await Promise.all(
    REVIEWERS.map((name, i) =>
      prisma.user.upsert({
        where: { email: `reviewer${i + 1}@plain.test` },
        update: {},
        create: {
          email: `reviewer${i + 1}@plain.test`,
          name,
          emailVerified: true,
        },
        select: { id: true },
      }),
    ),
  );

  /*
   * **리뷰가 없는 상품만 채운다.**
   *
   * 예전에는 리뷰가 하나라도 있으면 통째로 건너뛰었다. 그러면 나중에 상품을
   * 더했을 때 **새 상품만 영영 리뷰 없이 남는다** — 매대를 채우려고 스물여섯
   * 개를 더하다 실제로 그렇게 됐다.
   *
   * 상품 단위로 보면 두 번 돌려도 늘어나지 않으면서(이미 있는 것은 건너뛴다)
   * 새로 들어온 것만 채워진다. 시드는 덧붙일 수 있어야 한다.
   */
  const products = await prisma.product.findMany({
    where: { deletedAt: null, reviews: { none: {} } },
    select: {
      id: true, name: true,
      brand: { select: { name: true, merchantId: true } },
      category: { select: { slug: true } },
      listPrice: true, salePrice: true,
      images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
      variants: {
        where: { isActive: true },
        select: { id: true, label: true, priceOverride: true },
      },
    },
  });

  if (products.length === 0) {
    console.log('  모든 상품에 리뷰가 있어 새로 만들지 않습니다');
    // 만들지 않더라도 **집계는 항상 다시 센다.** 상품 upsert 가 돌면서
    // 값이 어긋나 있을 수 있고, 다시 세는 비용은 상품 수만큼뿐이다.
    await recountAll();
    return;
  }

  let orderSeq = 0;
  let reviewCount = 0;
  let productIndex = 0;

  for (const product of products) {
    productIndex += 1;
    const variant = product.variants[0];
    if (!variant) continue;

    // 상품마다 4~9명. 전부 같은 수면 목록이 기계처럼 보인다.
    const howMany = 4 + Math.floor(random() * 6);
    const bodies = bodiesFor(product.category.slug);

    for (let n = 0; n < howMany; n += 1) {
      const reviewer = reviewers[(n * 5 + orderSeq) % reviewers.length];
      if (!reviewer) continue;

      const unitPrice = variant.priceOverride ?? product.salePrice ?? product.listPrice;
      // 최근 6개월 안쪽으로 흩어 둔다
      const daysAgo = 7 + Math.floor(random() * 170);
      const placedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const deliveredAt = new Date(placedAt.getTime() + 2 * 24 * 60 * 60 * 1000);

      orderSeq += 1;
      const stamp = placedAt.toISOString().slice(0, 10).replace(/-/g, '');

      const order = await prisma.order.create({
        data: {
          orderNo: `${stamp}-${String(9_000_000 + orderSeq).slice(0, 7)}`,
          userId: reviewer.id,
          status: 'CONFIRMED',
          listTotal: product.listPrice,
          productDiscount: product.listPrice - unitPrice,
          payable: unitPrice,
          recipient: '수령인',
          recipientPhone: '010-0000-0000',
          postalCode: '06236',
          address1: '서울특별시 강남구 테헤란로 152',
          placedAt,
          paidAt: placedAt,
          deliveredAt,
          confirmedAt: new Date(deliveredAt.getTime() + 3 * 24 * 60 * 60 * 1000),
          items: {
            create: {
              variantId: variant.id,
              merchantId: product.brand.merchantId,
              productName: product.name,
              brandName: product.brand.name,
              optionLabel: variant.label,
              imageUrl: product.images[0]?.url ?? null,
              listPrice: product.listPrice,
              unitPrice,
              quantity: 1,
              subtotal: unitPrice,
              status: 'CONFIRMED',
            },
          },
        },
        select: { items: { select: { id: true } } },
      });

      const orderItemId = order.items[0]?.id;
      if (!orderItemId) continue;

      const rating = pick(RATING_POOL, random);
      const content = [
        rotate(OPENERS, n, productIndex),
        rotate(bodies, n, productIndex * 2),
        // 3점 이하에는 아쉬운 점을 한 줄 더 붙인다
        rating <= 3 ? '기대했던 것보다는 조금 아쉬웠습니다.' : '',
        pick(CLOSERS, random),
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      await prisma.review.create({
        data: {
          userId: reviewer.id,
          productId: product.id,
          orderItemId,
          rating,
          content,
          sizeFit: pick(SIZE_FIT_POOL, random),
          height: 155 + Math.floor(random() * 35),
          weight: 45 + Math.floor(random() * 40),
          createdAt: new Date(deliveredAt.getTime() + 4 * 24 * 60 * 60 * 1000),
        },
      });
      reviewCount += 1;
    }
  }

  await recountAll();

  console.log(`  리뷰어 ${reviewers.length}명 · 주문 ${orderSeq}건 · 리뷰 ${reviewCount}건`);
}

/**
 * 모든 상품의 평점 집계를 원본에서 다시 센다.
 * 앱의 recountRating 과 같은 규칙이라 어느 쪽으로 써도 결과가 같다.
 */
async function recountAll(): Promise<void> {
  const grouped = await prisma.review.groupBy({
    by: ['productId'],
    where: { deletedAt: null },
    _sum: { rating: true },
    _count: { _all: true },
  });

  const counted = new Map(
    grouped.map((row) => [row.productId, { sum: row._sum.rating ?? 0, count: row._count._all }]),
  );

  // 리뷰가 하나도 없는 상품도 0 으로 맞춰야 한다.
  // 달린 것만 갱신하면 지워진 뒤의 잔값이 남는다.
  const products = await prisma.product.findMany({ select: { id: true } });

  for (const { id } of products) {
    const { sum, count } = counted.get(id) ?? { sum: 0, count: 0 };
    await prisma.product.update({
      where: { id },
      data: {
        ratingSum: sum,
        reviewCount: count,
        ratingScore: count === 0 ? 0 : Math.round((sum / count) * 100),
      },
    });
  }
}
