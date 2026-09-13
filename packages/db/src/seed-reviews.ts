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
import { GRADE_REWARD_PERCENT, percentOf, rewardExpiresAt, type Won } from '@shop/core';
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
    // 적립도 마찬가지다. 여기서 빠져나가면 옛 주문의 원장이 영영 안 채워진다.
    await grantMissingRewards();
    await assertRewardLedger();
    return;
  }

  /**
   * **0 부터 세면 두 번째 시드가 터진다.**
   *
   * 주문번호가 `날짜-9000001` 처럼 이 숫자로 만들어지는데, 이 함수는 리뷰가
   * 없는 상품만 골라 돈다 — 상품을 더하고 다시 시드하면 새 상품만 처리하면서
   * 번호를 1 부터 다시 매기고, 지난번에 만든 주문과 부딪힌다. 실제로 아우터를
   * 열세 개 더하고 다시 돌렸더니 `orders_orderNo_key` 에서 멈췄다.
   *
   * 이미 있는 주문 수만큼 건너뛰고 시작한다. 번호는 늘 앞으로만 가므로
   * 몇 번을 다시 돌려도 부딪히지 않는다.
   */
  let orderSeq = await prisma.order.count();
  const startedAt = orderSeq;
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
          // 앱은 주문할 때 이 값을 계산해 두고 확정할 때 그만큼 준다
          rewardPoints: percentOf(unitPrice as Won, GRADE_REWARD_PERCENT.BASIC),
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
  await grantMissingRewards();
  await assertRewardLedger();

  const made = orderSeq - startedAt;
  console.log(`  리뷰어 ${reviewers.length}명 · 주문 ${made}건 · 리뷰 ${reviewCount}건`);
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

/**
 * 구매확정 주문에 **빠져 있는 적립을 채운다.**
 *
 * 앱에서 구매확정은 언제나 적립과 함께 일어난다 — 상태를 바꾸는 그 트랜잭션
 * 안에서 `EARN_PURCHASE` 원장을 쓰고 잔액을 올린다(grant-reward). 그런데
 * 시드는 확정된 주문을 곧바로 만들어 왔고, **그래서 이 DB 에는 확정 주문이
 * 수백 건인데 구매 적립 원장이 한 줄도 없었다.** 화면에는 가입 축하 포인트만
 * 보이고, 소멸 예정도 정산 배치도 볼 것이 없다.
 *
 * 파생 칸을 시드가 안 채워 검색이 0건이던 것과 같은 자리다 — 규칙이 앱 경로에만
 * 있으면 시드가 만든 데이터는 그 규칙 밖에 산다.
 *
 * **이미 있는 주문도 채운다.** 원장 유무로 고르므로 몇 번을 돌려도 한 번만
 * 준다 — 앱의 `grantPurchaseReward` 가 같은 방식으로 두 번 주지 않는 것과
 * 같은 이유이고, 같은 조건이다.
 */
async function grantMissingRewards(): Promise<void> {
  const confirmed = await prisma.order.findMany({
    where: { status: 'CONFIRMED' },
    select: { id: true, orderNo: true, userId: true, payable: true, rewardPoints: true, confirmedAt: true },
  });

  const granted = await prisma.pointTransaction.findMany({
    where: { reason: 'EARN_PURCHASE', orderId: { in: confirmed.map((o) => o.id) } },
    select: { orderId: true },
  });
  const already = new Set(granted.map((g) => g.orderId));

  let filled = 0;
  let total = 0;

  for (const order of confirmed) {
    if (already.has(order.id)) continue;

    /*
     * 옛 시드가 만든 주문에는 적립 예정값이 없다. 그때는 앱과 같은 규칙으로
     * 지금 계산해 **주문에도 함께 적어 둔다** — 화면이 "확정 시 N포인트" 라고
     * 말하는 자리가 그 칸이다.
     */
    const amount =
      order.rewardPoints > 0
        ? order.rewardPoints
        : percentOf(order.payable as Won, GRADE_REWARD_PERCENT.BASIC);
    if (amount <= 0) continue;

    const at = order.confirmedAt ?? new Date();

    await prisma.$transaction([
      ...(order.rewardPoints === amount
        ? []
        : [prisma.order.update({ where: { id: order.id }, data: { rewardPoints: amount } })]),
      prisma.pointTransaction.create({
        data: {
          userId: order.userId,
          amount,
          reason: 'EARN_PURCHASE',
          orderId: order.id,
          note: `주문 ${order.orderNo} 구매확정 적립`,
          expiresAt: rewardExpiresAt(at),
          createdAt: at,
        },
      }),
      prisma.user.update({
        where: { id: order.userId },
        data: { pointBalance: { increment: amount } },
      }),
    ]);

    filled += 1;
    total += amount;
  }

  if (filled > 0) console.log(`  구매 적립 ${filled}건 ${total.toLocaleString('ko-KR')}P 채움`);
}

/**
 * 적립 원장이 맞는지 시드가 스스로 확인한다.
 *
 * **파생 칸 확인(seed.ts 의 assertDerivedColumns)과 같은 자리다.** 한 번
 * 채워 놓아도 다음에 누가 확정 주문을 만드는 길을 하나 더 내면 또 어긋난다.
 * 어긋난 채로 시드가 끝나면 화면은 멀쩡해 보이고, 포인트가 안 맞는다는 것은
 * 한참 뒤에나 드러난다.
 *
 * 두 가지를 본다.
 * 1. 구매확정 주문마다 `EARN_PURCHASE` 원장이 **정확히 하나**다 — 없으면 약속한
 *    적립이 안 나간 것이고, 둘이면 돈을 두 번 준 것이다.
 * 2. 잔액이 원장 합과 같다 — 잔액은 캐시이고 원장이 진실이라는 앱의 규칙이다.
 *    `reconcile-points` 배치가 보는 값이 이것이다.
 */
async function assertRewardLedger(): Promise<void> {
  const confirmed = await prisma.order.findMany({
    where: { status: 'CONFIRMED' },
    select: { id: true, orderNo: true, rewardPoints: true },
  });

  const rows = await prisma.pointTransaction.groupBy({
    by: ['orderId'],
    where: { reason: 'EARN_PURCHASE', orderId: { in: confirmed.map((o) => o.id) } },
    _count: { _all: true },
  });
  /*
   * 타입을 손으로 적는다. `groupBy` 가 돌려주는 것은 넓은 타입이라, 그대로
   * 쓰면 숫자인 줄 알고 문자열에 끼워 넣는 자리에서 `{}` 로 읽힌다 —
   * lint 가 그것을 잡아 준다.
   */
  const counted = new Map<string, number>(
    rows.map((r) => [String(r.orderId), Number(r._count._all)]),
  );

  // 적립할 것이 없는 주문(0원)은 원장도 없는 것이 맞다
  const wrong = confirmed.filter((o) => (counted.get(o.id) ?? 0) !== (o.rewardPoints > 0 ? 1 : 0));
  if (wrong.length > 0) {
    for (const o of wrong.slice(0, 5)) {
      console.error(`  주문 ${o.orderNo}  적립예정 ${o.rewardPoints}P  원장 ${counted.get(o.id) ?? 0}줄`);
    }
    throw new Error(
      `구매확정 주문 ${wrong.length}건의 적립 원장이 맞지 않는다. ` +
        '확정 주문을 만드는 길이 적립을 함께 쓰지 않은 것이다.',
    );
  }

  const ledger = await prisma.pointTransaction.groupBy({ by: ['userId'], _sum: { amount: true } });
  const owed = new Map<string, number>(
    ledger.map((l) => [String(l.userId), Number(l._sum.amount ?? 0)]),
  );
  const users = await prisma.user.findMany({ select: { id: true, email: true, pointBalance: true } });

  const off = users.filter((u) => (owed.get(u.id) ?? 0) !== u.pointBalance);
  if (off.length > 0) {
    for (const u of off.slice(0, 5)) {
      console.error(`  ${u.email}  잔액 ${u.pointBalance}P  원장 ${owed.get(u.id) ?? 0}P`);
    }
    throw new Error(`잔액이 원장과 어긋난 회원 ${off.length}명.`);
  }

  console.log(`  적립 원장 확인 — 확정 주문 ${confirmed.length}건, 잔액 ${users.length}명 모두 맞음`);
}
