import { describe, it, expect, vi, beforeEach } from 'vitest';

const findManyVariants = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const findFirstUserCoupon = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({
  prisma: {
    productVariant: { findMany: findManyVariants },
    userCoupon: { findFirst: findFirstUserCoupon },
  },
}));

const { quoteCart } = await import('~/lib/queries/cart');

const variant = (over: Record<string, unknown> = {}) => ({
  id: 'v-coat-m', label: '오트밀 / M', stock: 12, isActive: true, priceOverride: null,
  product: {
    slug: 'oversized-wool-coat', name: '오버사이즈 울 블렌드 코트',
    listPrice: 413_000, salePrice: 289_000, status: 'ACTIVE', deletedAt: null,
    brand: { name: 'STUDIO NOON' },
  },
  ...over,
});

const viewer = { id: 'u-1', pointBalance: 3_240 };

beforeEach(() => {
  findManyVariants.mockReset();
  findFirstUserCoupon.mockReset().mockResolvedValue(null);
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
