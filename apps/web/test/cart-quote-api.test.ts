import { describe, it, expect } from 'vitest';
import { POST } from '~/app/api/cart/quote/route';

const post = (body: unknown) =>
  POST(
    new Request('http://localhost/api/cart/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );

const coat = {
  variantId: 'v-coat-m', productName: '오버사이즈 울 블렌드 코트',
  listPrice: 413_000, discountPercent: 30, quantity: 1,
};
const knit = {
  variantId: 'v-knit-l', productName: '램스울 크루넥 니트',
  listPrice: 129_000, discountPercent: 0, quantity: 1,
};

describe('POST /api/cart/quote — 금액은 서버가 정한다', () => {
  it('시안의 장바구니와 같은 금액을 돌려준다', async () => {
    const res = await post({ lines: [coat, knit] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.listTotal).toBe(542_000);
    expect(body.productDiscount).toBe(123_900);
    expect(body.merchandiseTotal).toBe(418_100);
    expect(body.isFreeShipping).toBe(true);
    expect(body.payable).toBe(418_100);
    expect(body.rewardPoints).toBe(4_181);
  });

  it('쿠폰과 포인트를 함께 적용한다', async () => {
    const res = await post({
      lines: [coat, knit],
      coupon: { kind: 'amount', code: 'WELCOME', value: 10_000, minimumOrder: 30_000 },
      pointsToUse: 3_000,
    });
    const body = await res.json();
    expect(body.couponDiscount).toBe(10_000);
    expect(body.pointsUsed).toBe(3_000);
    expect(body.payable).toBe(405_100);
  });

  it('도서산간은 무료배송이어도 추가비를 붙인다', async () => {
    const res = await post({ lines: [coat], isRemoteArea: true });
    const body = await res.json();
    expect(body.isFreeShipping).toBe(true);
    expect(body.shippingFee).toBe(3_000);
  });

  it('무료배송까지 남은 금액을 알려준다', async () => {
    const res = await post({
      lines: [{ ...knit, listPrice: 30_000, discountPercent: 0 }],
    });
    const body = await res.json();
    expect(body.isFreeShipping).toBe(false);
    expect(body.remainingForFreeShipping).toBe(20_000);
    expect(body.shippingFee).toBe(3_000);
  });
});

describe('POST /api/cart/quote — 잘못된 입력을 경계에서 막는다', () => {
  it('빈 장바구니는 400', async () => {
    const res = await post({ lines: [] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  it('소수점 금액은 400 — 부동소수점 금액이 결제로 새어 나가면 안 된다', async () => {
    const res = await post({ lines: [{ ...coat, listPrice: 413_000.5 }] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields).toBeDefined();
  });

  it('음수 금액은 400', async () => {
    const res = await post({ lines: [{ ...coat, listPrice: -1000 }] });
    expect(res.status).toBe(400);
  });

  it('수량 0은 400이고 어느 필드가 틀렸는지 알려준다', async () => {
    const res = await post({ lines: [{ ...coat, quantity: 0 }] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(Object.keys(body.fields).some((k) => k.includes('quantity'))).toBe(true);
  });

  it('100%를 넘는 할인율은 400', async () => {
    const res = await post({ lines: [{ ...coat, discountPercent: 120 }] });
    expect(res.status).toBe(400);
  });

  it('JSON이 아니면 400', async () => {
    const res = await post('이건 JSON이 아니다');
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('INVALID_JSON');
  });

  it('알 수 없는 쿠폰 종류는 400', async () => {
    const res = await post({
      lines: [coat],
      coupon: { kind: 'buy-one-get-one', code: 'X' },
    });
    expect(res.status).toBe(400);
  });
});
