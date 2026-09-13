import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyVariants = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const findFirstUserCoupon = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
/** 견적은 쓸 수 있는 쿠폰 목록도 함께 돌려준다 */
const findManyUserCoupons = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const findPolicy = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({
  prisma: {
    productVariant: { findMany: findManyVariants },
    userCoupon: { findFirst: findFirstUserCoupon, findMany: findManyUserCoupons },
    shippingPolicy: { findUnique: findPolicy },
  },
}));

const { quoteCart } = await import('~/lib/queries/cart');

const variant = (over: Record<string, unknown> = {}) => ({
  id: 'v-coat-m', label: '오트밀 / M', stock: 12, isActive: true, priceOverride: null,
  product: {
    slug: 'oversized-wool-coat', name: '오버사이즈 울 블렌드 코트',
    listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE', deletedAt: null,
    brand: { name: 'STUDIO NOON' },
    // 실제 select 와 같은 모양이어야 한다 — 사진이 없는 상품도 있다
    images: [{ url: 'https://cdn.test/coat.jpg', alt: '오트밀 코트', blurDataUrl: null }],
  },
  ...over,
});

const viewer = { id: 'u-1', pointBalance: 3_240 };

beforeEach(() => {
  findManyVariants.mockReset();
  findManyUserCoupons.mockReset().mockResolvedValue([]);
  findFirstUserCoupon.mockReset().mockResolvedValue(null);
  // 배송비 정책은 이제 DB 에서 온다. 안 정하면 코드의 바닥값으로 간다.
  findPolicy.mockReset().mockResolvedValue(null);
});

describe('가격은 DB 가 정한다', () => {
  it('요청에 없는 가격을 DB 에서 채워 온다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);

    expect(q.lines[0]).toMatchObject({
      productName: '오버사이즈 울 블렌드 코트',
      brandName: 'STUDIO NOON',
      optionLabel: '오트밀 / M',
      listPrice: 413_000,
      unitPrice: 289_000,
      discountPercent: 30,
      subtotal: 289_000,
    });
    expect(q.payable).toBe(289_000);
  });

  it('변형별 가격이 따로 있으면 그걸 쓴다', async () => {
    findManyVariants.mockResolvedValue([variant({ priceOverride: 310_000 })]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.lines[0]?.unitPrice).toBe(310_000);
  });

  it('할인이 없는 상품은 정가로 판다', async () => {
    findManyVariants.mockResolvedValue([
      variant({ product: { ...variant().product, salePrice: null } }),
    ]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.lines[0]?.unitPrice).toBe(413_000);
    expect(q.lines[0]?.discountPercent).toBe(0);
  });
});

describe('담아 둔 사이에 생긴 문제를 알린다', () => {
  it('재고보다 많이 담겼으면 재고만큼만 계산하고 알린다', async () => {
    findManyVariants.mockResolvedValue([variant({ stock: 2 })]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 5 }], isRemoteArea: false }, null);

    expect(q.lines[0]).toMatchObject({
      quantity: 2, requestedQuantity: 5, issue: 'STOCK_REDUCED', subtotal: 578_000,
    });
    expect(q.payable).toBe(578_000);
  });

  it('품절이면 금액에서 빼고 표시한다 — 조용히 사라지면 안 된다', async () => {
    findManyVariants.mockResolvedValue([variant({ stock: 0 })]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);

    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ quantity: 0, issue: 'SOLD_OUT' });
    expect(q.payable).toBe(0);
    // 살 수 있는 게 없으면 배송비도 매기지 않는다
    expect(q.shippingFee).toBe(0);
  });

  it('삭제된 상품은 NOT_FOUND 로 남긴다', async () => {
    findManyVariants.mockResolvedValue([]);
    const q = await quoteCart({ lines: [{ variantId: 'v-gone', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.lines[0]).toMatchObject({ issue: 'NOT_FOUND', quantity: 0 });
  });

  it('판매 중지된 옵션은 INACTIVE 로 남기되 상품명은 보여 준다', async () => {
    findManyVariants.mockResolvedValue([variant({ isActive: false })]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.lines[0]).toMatchObject({
      issue: 'INACTIVE', quantity: 0, productName: '오버사이즈 울 블렌드 코트',
    });
  });

  it('숨김 처리된 상품도 담을 수 없다', async () => {
    findManyVariants.mockResolvedValue([
      variant({ product: { ...variant().product, status: 'HIDDEN' } }),
    ]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.lines[0]?.issue).toBe('INACTIVE');
  });

  it('문제 있는 줄과 정상인 줄이 섞여도 정상인 것만 계산한다', async () => {
    findManyVariants.mockResolvedValue([
      variant(),
      variant({ id: 'v-knit', stock: 0, label: '차콜 / L' }),
    ]);
    const q = await quoteCart({
      lines: [{ variantId: 'v-coat-m', quantity: 1 }, { variantId: 'v-knit', quantity: 1 }],
      isRemoteArea: false,
    }, null);
    expect(q.lines).toHaveLength(2);
    expect(q.payable).toBe(289_000);
  });
});

describe('쿠폰은 코드만으로 적용되지 않는다', () => {
  const dbCoupon = {
    code: 'WELCOME10000', name: '신규회원 10,000원 할인', kind: 'AMOUNT',
    value: 10_000, percent: 0, maxDiscount: null, minimumOrder: 30_000,
    // 대상이 비어 있으면 장바구니 전체가 대상이다
    targets: [] as { targetType: string; targetId: string }[],
  };

  it('비로그인은 쿠폰을 쓸 수 없다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], couponCode: 'WELCOME10000', isRemoteArea: false },
      null,
    );
    expect(findFirstUserCoupon).not.toHaveBeenCalled();
    expect(q.couponDiscount).toBe(0);
    expect(q.couponName).toBeNull();
  });

  it('발급받지 않은 코드는 무시한다 — 코드만 알면 쓸 수 있으면 정책이 무의미하다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    findFirstUserCoupon.mockResolvedValue(null);
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], couponCode: 'WELCOME10000', isRemoteArea: false },
      viewer,
    );
    expect(q.couponDiscount).toBe(0);
  });

  it('발급받은 쿠폰이면 적용하고 이름을 돌려준다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    findFirstUserCoupon.mockResolvedValue({ coupon: dbCoupon });
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], couponCode: 'WELCOME10000', isRemoteArea: false },
      viewer,
    );
    expect(q.couponDiscount).toBe(10_000);
    expect(q.couponName).toBe('신규회원 10,000원 할인');
    expect(q.payable).toBe(279_000);
  });

  it('최소 주문금액에 못 미치면 적용하지 않는다', async () => {
    findManyVariants.mockResolvedValue([
      variant({ product: { ...variant().product, listPrice: 20_000, salePrice: 20_000 } }),
    ]);
    findFirstUserCoupon.mockResolvedValue({ coupon: dbCoupon });
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], couponCode: 'WELCOME10000', isRemoteArea: false },
      viewer,
    );
    expect(q.couponDiscount).toBe(0);
  });
});

describe('포인트', () => {
  it('보유 포인트는 세션이 아니라 서버가 준 값으로 제한한다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], pointsToUse: 999_999, isRemoteArea: false },
      viewer,
    );
    expect(q.pointsUsed).toBe(3_240);
    expect(q.pointsAvailable).toBe(3_240);
  });

  it('비로그인은 포인트를 쓸 수 없다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    const q = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], pointsToUse: 3_000, isRemoteArea: false },
      null,
    );
    expect(q.pointsUsed).toBe(0);
    expect(q.pointsAvailable).toBe(0);
  });
});

describe('배송비', () => {
  it('5만원 미만이면 배송비가 붙고 남은 금액을 알려 준다', async () => {
    findManyVariants.mockResolvedValue([
      variant({ product: { ...variant().product, listPrice: 30_000, salePrice: 30_000 } }),
    ]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(q.isFreeShipping).toBe(false);
    expect(q.shippingFee).toBe(3_000);
    expect(q.remainingForFreeShipping).toBe(20_000);
  });

  it('도서산간은 무료배송이어도 추가비를 붙인다', async () => {
    findManyVariants.mockResolvedValue([variant()]);
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: true }, null);
    expect(q.isFreeShipping).toBe(true);
    expect(q.shippingFee).toBe(3_000);
  });
});

describe('등급별 적립률', () => {
  const line = { lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false };

  beforeEach(() => {
    findManyVariants.mockResolvedValue([variant()]);
    findFirstUserCoupon.mockResolvedValue(null);
  });

  it('비회원은 기본 적립률이다', async () => {
    const q = await quoteCart(line, null);
    // 289,000 의 1%
    expect(q.rewardPoints).toBe(2_890);
  });

  it('적립률을 넘기면 그대로 계산에 붙는다', async () => {
    /*
     * 이게 붙지 않아서, 마이페이지가 "적립률 3%" 라고 적어 둔 회원에게
     * 실제로는 1% 만 쌓였다. 화면이 약속한 것과 실제로 주는 것이 달랐다.
     */
    const q = await quoteCart(line, { id: 'u-1', pointBalance: 0, rewardPercent: 3 });
    expect(q.rewardPoints).toBe(8_670);
  });

  it('등급이 높을수록 더 쌓인다', async () => {
    const basic = await quoteCart(line, { id: 'u-1', pointBalance: 0, rewardPercent: 1 });
    const vip = await quoteCart(line, { id: 'u-1', pointBalance: 0, rewardPercent: 5 });

    expect(vip.rewardPoints).toBeGreaterThan(basic.rewardPoints);
  });

  it('적립률을 안 넘긴 회원은 기본값으로 떨어진다', async () => {
    // 부르는 쪽이 빠뜨려도 계산이 깨지지는 않는다
    const q = await quoteCart(line, { id: 'u-1', pointBalance: 0 });
    expect(q.rewardPoints).toBe(2_890);
  });
});

/**
 * 담은 것이 무엇인지 눈으로 확인할 수 있어야 한다.
 *
 * 예전에는 견적에 사진 칸이 아예 없어서, 장바구니와 주문서에 "IMG" 라고 적힌
 * 회색 칸만 있었다 — **사는 과정 내내 사진이 사라지는 셈**이라, 옵션이 비슷한
 * 상품을 여럿 담으면 무엇이 무엇인지 구별할 방법이 없었다.
 */
describe('줄마다 사진을 함께 준다', () => {
  it('첫 사진의 주소·대체 텍스트·자리표시를 싣는다', async () => {
    findManyVariants.mockResolvedValue([variant()]);

    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.lines[0]).toMatchObject({
      imageUrl: 'https://cdn.test/coat.jpg',
      imageAlt: '오트밀 코트',
    });
  });

  it('사진이 없는 상품은 빈 값이다 — 지어내지 않는다', async () => {
    findManyVariants.mockResolvedValue([
      variant({ product: { ...variant().product, images: [] } }),
    ]);

    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.lines[0]).toMatchObject({ imageUrl: null, imageAlt: null, blurDataUrl: null });
  });

  /** 사라진 상품 줄에도 같은 칸이 있어야 화면이 갈라지지 않는다 */
  it('사라진 상품 줄에도 칸은 있다', async () => {
    findManyVariants.mockResolvedValue([]);

    const q = await quoteCart({ lines: [{ variantId: 'v-gone', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.lines[0]).toMatchObject({ issue: 'NOT_FOUND', imageUrl: null });
  });
});

/**
 * 견적이 **쓸 수 있는 쿠폰과 각각 깎이는 금액까지** 함께 돌려준다.
 *
 * 쿠폰을 받을 수는 있는데 쓸 수가 없었다 — 서버는 코드를 받으면 계산할 줄
 * 알았지만 어느 화면도 코드를 보내지 않았다. 화면이 따로 세게 두면 결제
 * 금액과 어긋나는 날이 오므로, 세는 일을 견적이 맡는다.
 */
describe('쓸 수 있는 쿠폰 제안', () => {
  const userCoupon = (code: string, over: Record<string, unknown> = {}) => ({
    expiresAt: new Date('2026-12-31T00:00:00Z'),
    coupon: {
      code, name: `${code} 쿠폰`, kind: 'AMOUNT', value: 5_000, percent: 0,
      maxDiscount: null, minimumOrder: 0, targets: [], ...over,
    },
  });

  beforeEach(() => {
    findManyVariants.mockResolvedValue([variant()]);
  });

  it('비로그인은 빈 목록이다 — 남의 쿠폰을 보여 줄 일이 없다', async () => {
    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);

    expect(q.coupons).toEqual([]);
    expect(findManyUserCoupons).not.toHaveBeenCalled();
  });

  it('많이 깎이는 순으로 준다 — 화면이 다시 정렬하지 않게', async () => {
    findManyUserCoupons.mockResolvedValue([
      userCoupon('SMALL', { value: 1_000 }),
      userCoupon('BIG', { value: 9_000 }),
    ]);

    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.coupons.map((c) => c.code)).toEqual(['BIG', 'SMALL']);
    expect(q.coupons[0]?.discount).toBe(9_000);
  });

  /** 목록에서 빼면 "내 쿠폰이 어디 갔지" 가 된다 */
  it('못 쓰는 쿠폰도 0 으로 함께 준다', async () => {
    findManyUserCoupons.mockResolvedValue([
      userCoupon('OK'),
      userCoupon('HIGH', { minimumOrder: 9_999_999 }),
    ]);

    const q = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.coupons).toHaveLength(2);
    expect(q.coupons.find((c) => c.code === 'HIGH')?.discount).toBe(0);
  });

  it('담긴 것이 없으면 제안하지 않는다 — 0 원짜리 목록은 보여 줄 값어치가 없다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('OK')]);
    findManyVariants.mockResolvedValue([]);

    const q = await quoteCart({ lines: [{ variantId: 'gone', quantity: 1 }], isRemoteArea: false }, viewer);

    expect(q.coupons).toEqual([]);
  });

  /** 화면이 보는 금액과 결제될 금액이 어긋나면 사람은 어느 쪽도 믿을 수 없다 */
  it('제안한 금액이 그 쿠폰을 붙였을 때의 할인액과 같다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('BIG', { value: 9_000 })]);
    findFirstUserCoupon.mockResolvedValue(userCoupon('BIG', { value: 9_000 }));

    const offered = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, viewer);
    const applied = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], couponCode: 'BIG', isRemoteArea: false },
      viewer,
    );

    expect(applied.couponDiscount).toBe(offered.coupons[0]?.discount);
  });
});

/**
 * **고른 것이 없으면 서버가 가장 많이 깎이는 것을 붙인다.**
 *
 * 코드를 외워 넣게 하지 않으려는 것이다. 화면이 고르면 서버가 정한 금액과
 * 어긋날 자리가 생기므로, 고르는 일도 여기서 한다.
 */
describe('쿠폰 자동 적용', () => {
  const userCoupon = (code: string, over: Record<string, unknown> = {}) => ({
    expiresAt: new Date('2026-12-31T00:00:00Z'),
    coupon: {
      code, name: `${code} 쿠폰`, kind: 'AMOUNT', value: 5_000, percent: 0,
      maxDiscount: null, minimumOrder: 0, targets: [], ...over,
    },
  });
  const cart = { lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false };

  beforeEach(() => {
    findManyVariants.mockResolvedValue([variant()]);
  });

  it('아무것도 안 고르면 가장 많이 깎이는 것이 붙는다', async () => {
    findManyUserCoupons.mockResolvedValue([
      userCoupon('SMALL', { value: 1_000 }),
      userCoupon('BIG', { value: 9_000 }),
    ]);

    const q = await quoteCart(cart, viewer);

    expect(q.couponCode).toBe('BIG');
    expect(q.couponDiscount).toBe(9_000);
  });

  /** 코드를 비워 보내는 것만으로는 "아직 안 골랐다" 와 구분되지 않는다 */
  it('쓰지 않겠다고 하면 붙이지 않는다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('BIG', { value: 9_000 })]);

    const q = await quoteCart({ ...cart, useCoupon: false }, viewer);

    expect(q.couponCode).toBeNull();
    expect(q.couponDiscount).toBe(0);
  });

  /** 두 값이 어긋나게 오면 마지막으로 누른 것 — "쓰지 않기" 를 따른다 */
  it('쓰지 않기와 코드가 함께 오면 쓰지 않는다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('BIG', { value: 9_000 })]);
    findFirstUserCoupon.mockResolvedValue(userCoupon('BIG', { value: 9_000 }));

    const q = await quoteCart({ ...cart, couponCode: 'BIG', useCoupon: false }, viewer);

    expect(q.couponCode).toBeNull();
    expect(q.couponDiscount).toBe(0);
  });

  it('고른 것이 있으면 그것을 쓴다 — 우리가 더 나은 것으로 바꾸지 않는다', async () => {
    findManyUserCoupons.mockResolvedValue([
      userCoupon('SMALL', { value: 1_000 }),
      userCoupon('BIG', { value: 9_000 }),
    ]);
    findFirstUserCoupon.mockResolvedValue(userCoupon('SMALL', { value: 1_000 }));

    const q = await quoteCart({ ...cart, couponCode: 'SMALL' }, viewer);

    expect(q.couponCode).toBe('SMALL');
    expect(q.couponDiscount).toBe(1_000);
  });

  it('쓸 수 있는 것이 하나도 없으면 아무것도 붙지 않는다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('HIGH', { minimumOrder: 9_999_999 })]);

    const q = await quoteCart(cart, viewer);

    expect(q.couponCode).toBeNull();
    expect(q.couponDiscount).toBe(0);
  });

  /** 화면은 무엇이 붙었는지 이 값으로 안다 — 이름만으로는 다시 찾을 수 없다 */
  it('붙은 쿠폰의 코드와 이름을 함께 알려 준다', async () => {
    findManyUserCoupons.mockResolvedValue([userCoupon('BIG', { value: 9_000 })]);

    const q = await quoteCart(cart, viewer);

    expect(q.couponCode).toBe('BIG');
    expect(q.couponName).toBe('BIG 쿠폰');
  });
});

/**
 * 배송비 정책이 **견적까지 닿는가.**
 *
 * 값이 코드 상수에서 운영 데이터로 옮겨 갔다. 옮기는 것보다 어려운 것은
 * **읽는 자리를 하나도 빠뜨리지 않는 것**이다 — 견적이 옛 상수를 계속 보고
 * 있으면, 상품 화면은 새 기준을 적어 놓고 결제는 옛 기준으로 계산한다.
 * 어느 쪽이 맞는지는 아무도 말해 주지 않고, 차이는 배송비 몇 천 원이라
 * 눈에도 잘 안 띈다.
 *
 * **화면 검사로는 이 자리를 못 잡는다.** 정책은 가게 전체에 하나뿐이라,
 * 검사가 그것을 바꾸는 동안 다른 검사들이 다른 금액을 본다. 그래서 여기서
 * 잰다 — 실제로 이 줄을 빼 보고 e2e 가 통과하는 것을 확인했다.
 */
describe('배송비 정책', () => {
  beforeEach(() => {
    findManyVariants.mockResolvedValue([variant()]);
  });

  it('운영이 정한 값으로 계산한다', async () => {
    findPolicy.mockResolvedValue({
      id: 'default', baseFee: 2500, freeThreshold: 10_000_000, remoteSurcharge: 4500,
    });

    const quote = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);

    // 코드의 바닥값은 3,000 이다. 2,500 이 나오면 DB 값을 읽은 것이다.
    expect(quote.shippingFee).toBe(2500);
  });

  it('도서산간 추가금도 운영이 정한 값이다', async () => {
    findPolicy.mockResolvedValue({
      id: 'default', baseFee: 2500, freeThreshold: 10_000_000, remoteSurcharge: 4500,
    });

    const quote = await quoteCart(
      { lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: true },
      null,
    );
    expect(quote.shippingFee).toBe(2500 + 4500);
  });

  it('무료 기준도 운영이 정한 값이다', async () => {
    // 코드의 바닥값(5만원)이면 289,000원짜리는 이미 무료다 — 기준을 올려서 가른다
    findPolicy.mockResolvedValue({
      id: 'default', baseFee: 3000, freeThreshold: 500_000, remoteSurcharge: 3000,
    });

    const quote = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(quote.isFreeShipping, '옛 기준(5만원)으로 판정했다').toBe(false);
  });

  it('정책 줄이 없으면 바닥값으로 간다 — 배송비를 못 읽었다고 결제를 막지 않는다', async () => {
    findPolicy.mockResolvedValue(null);

    const quote = await quoteCart({ lines: [{ variantId: 'v-coat-m', quantity: 1 }], isRemoteArea: false }, null);
    expect(quote.isFreeShipping).toBe(true); // 289,000 >= 50,000
  });
});
