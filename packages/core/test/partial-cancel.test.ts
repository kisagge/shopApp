import { describe, it, expect } from 'vitest';
import {
  allocateByWeight, allocateOrderLines, planPartialCancel, remainingRefund, sharesOf,
  calculateCart, won, DEFAULT_SHIPPING, PartialCancelError,
  type CancelableLine, type PartialCancelInput,
} from '../src';

/**
 * 부분 취소의 돈 계산.
 *
 * 여기서 틀리면 **돈이 샌다** — 할인을 현금으로 바꿔 가거나, 같은 돈이 두 번 나가거나,
 * 원 단위가 조금씩 사라진다. 그래서 각 규칙을 "합이 맞는가" 로 한 번 더 본다.
 */

describe('최대 나머지법', () => {
  it('합이 언제나 원래 금액과 같다', () => {
    expect(allocateByWeight(10, [1, 1, 1])).toEqual([4, 3, 3]);
    for (const [total, weights] of [
      [9_999, [3, 7, 11, 13]],
      [1, [5, 5]],
      [289_000, [289_000, 59_000, 12_900]],
      [0, [1, 2]],
    ] as const) {
      const shares = allocateByWeight(total, weights);
      expect(shares.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('같은 입력이면 같은 결과다 — 동점은 앞 줄이 받는다', () => {
    expect(allocateByWeight(1, [1, 1])).toEqual([1, 0]);
    expect(allocateByWeight(1, [1, 1])).toEqual(allocateByWeight(1, [1, 1]));
  });

  it('가중치가 0 인 줄은 받지 않는다', () => {
    expect(allocateByWeight(5000, [0, 30_000, 20_000])).toEqual([0, 3000, 2000]);
  });

  it('가중치가 모두 0 이어도 금액을 흘리지 않는다', () => {
    expect(allocateByWeight(700, [0, 0])).toEqual([700, 0]);
  });

  it('곱이 2^53 을 넘어도 원이 틀리지 않는다', () => {
    const shares = allocateByWeight(99_999_999, [99_999_989, 99_999_971, 1]);
    expect(shares.reduce((a, b) => a + b, 0)).toBe(99_999_999);
    expect(shares[2]).toBe(0);
  });
});

describe('주문 금액을 줄에 나누기', () => {
  it('대상이 정해진 쿠폰은 대상 줄에만 붙는다', () => {
    const shares = allocateOrderLines(
      [
        { subtotal: 100_000, couponEligible: true },
        { subtotal: 50_000, couponEligible: false },
      ],
      { couponDiscount: 10_000, pointsUsed: 0, rewardPoints: 0 },
    );
    expect(shares.map((s) => s.couponShare)).toEqual([10_000, 0]);
  });

  it('calculateCart 가 낸 몫의 합은 주문에 적힐 할인·포인트·적립과 같다', () => {
    const totals = calculateCart({
      lines: [
        { variantId: 'a', productName: 'A', listPrice: won(89_000), salePrice: won(79_000), quantity: 1, productId: 'p-a' },
        { variantId: 'b', productName: 'B', listPrice: won(33_000), salePrice: won(29_900), quantity: 3, productId: 'p-b' },
        { variantId: 'c', productName: 'C', listPrice: won(12_000), salePrice: won(12_000), quantity: 1, productId: 'p-c' },
      ],
      coupon: { kind: 'percent', code: 'X', percent: 15, maxDiscount: null, minimumOrder: won(0), scope: { productIds: ['p-a', 'p-b'] } },
      pointsToUse: won(7_777),
      pointsAvailable: won(10_000),
    });
    const sum = (key: 'couponShare' | 'pointsShare' | 'rewardShare') =>
      totals.allocations.reduce((a, s) => a + s[key], 0);

    expect(sum('couponShare')).toBe(totals.couponDiscount);
    expect(sum('pointsShare')).toBe(totals.pointsUsed);
    expect(sum('rewardShare')).toBe(totals.rewardPoints);
    // 대상 아닌 줄은 쿠폰 몫이 없다
    expect(totals.allocations[2]!.couponShare).toBe(0);
  });
});

const line = (id: string, subtotal: number, over: Partial<CancelableLine> = {}): CancelableLine => ({
  id, subtotal, couponShare: 0, pointsShare: 0, rewardShare: 0, canceled: false, ...over,
});

const input = (over: Partial<PartialCancelInput>): PartialCancelInput => ({
  lines: [],
  cancelIds: [],
  order: { couponDiscount: 0, pointsUsed: 0, rewardPoints: 0, shippingFee: 0, isRemoteArea: false },
  policy: DEFAULT_SHIPPING, // 기본 3,000원, 5만원 이상 무료
  shippingDeductedSoFar: 0,
  ...over,
});

describe('부분 취소 계획', () => {
  it('할인 없는 줄은 판매가를 그대로 돌려준다', () => {
    const plan = planPartialCancel(input({
      // 남는 6만원이 여전히 무료배송 기준을 넘는다
      lines: [line('a', 30_000), line('b', 60_000)],
      cancelIds: ['a'],
    }));
    expect(plan).toMatchObject({ cash: 30_000, points: 0, shippingDeducted: 0, remainingMerchandise: 60_000 });
  });

  it('그 줄의 쿠폰 몫은 돌려주지 않는다 — 할인을 현금으로 바꿀 수 없다', () => {
    const plan = planPartialCancel(input({
      lines: [
        line('a', 60_000, { couponShare: 6_000 }),
        line('b', 40_000, { couponShare: 4_000 }),
      ],
      cancelIds: ['a'],
      order: { couponDiscount: 10_000, pointsUsed: 0, rewardPoints: 0, shippingFee: 0, isRemoteArea: false },
    }));
    // 남은 4만원은 무료배송 기준 아래 — 배송비 3,000원을 뗀다
    expect(plan).toMatchObject({ cash: 60_000 - 6_000 - 3_000, shippingDeducted: 3_000 });
  });

  it('포인트로 낸 몫은 포인트로 돌려준다', () => {
    const plan = planPartialCancel(input({
      lines: [
        line('a', 30_000, { pointsShare: 3_000, rewardShare: 270 }),
        line('b', 70_000, { pointsShare: 7_000, rewardShare: 630 }),
      ],
      cancelIds: ['a'],
      order: { couponDiscount: 0, pointsUsed: 10_000, rewardPoints: 900, shippingFee: 0, isRemoteArea: false },
    }));
    expect(plan).toMatchObject({ cash: 27_000, points: 3_000, rewardReduced: 270, shippingDeducted: 0 });
  });

  it('무료배송을 받던 주문이 기준 아래로 떨어지면 기본 배송비를 뗀다', () => {
    const plan = planPartialCancel(input({
      lines: [line('a', 30_000), line('b', 30_000)],
      cancelIds: ['b'],
    }));
    expect(plan).toMatchObject({ cash: 27_000, shippingDeducted: 3_000 });
  });

  it('원래 배송비를 냈으면 더 떼지 않는다', () => {
    const plan = planPartialCancel(input({
      lines: [line('a', 10_000), line('b', 20_000)],
      cancelIds: ['b'],
      order: { couponDiscount: 0, pointsUsed: 0, rewardPoints: 0, shippingFee: 3_000, isRemoteArea: false },
    }));
    expect(plan).toMatchObject({ cash: 20_000, shippingDeducted: 0 });
  });

  it('도서산간 추가비는 양쪽에 똑같이 들어 있어 떼는 금액에 안 섞인다', () => {
    const plan = planPartialCancel(input({
      lines: [line('a', 30_000), line('b', 30_000)],
      cancelIds: ['b'],
      order: { couponDiscount: 0, pointsUsed: 0, rewardPoints: 0, shippingFee: 3_000, isRemoteArea: true },
    }));
    expect(plan.shippingDeducted).toBe(3_000);
  });

  it('나눠 취소해도 배송비는 한 번만 뗀다', () => {
    const lines = [line('a', 20_000), line('b', 20_000), line('c', 20_000)];
    const first = planPartialCancel(input({ lines, cancelIds: ['a'] }));
    expect(first.shippingDeducted).toBe(3_000);

    const second = planPartialCancel(input({
      lines: lines.map((l) => (l.id === 'a' ? { ...l, canceled: true } : l)),
      cancelIds: ['b'],
      shippingDeductedSoFar: first.shippingDeducted,
    }));
    expect(second).toMatchObject({ cash: 20_000, shippingDeducted: 0 });
  });

  it('현금이 모자라면 포인트에서 뗀다', () => {
    const plan = planPartialCancel(input({
      lines: [
        line('a', 30_000, { pointsShare: 28_000 }),
        line('b', 30_000, { pointsShare: 0 }),
      ],
      cancelIds: ['a'],
      order: { couponDiscount: 0, pointsUsed: 28_000, rewardPoints: 0, shippingFee: 0, isRemoteArea: false },
    }));
    // 현금 몫 2,000 으로 3,000 을 못 떼니 나머지 1,000 은 포인트에서
    expect(plan).toMatchObject({ cash: 0, points: 27_000, shippingDeducted: 3_000 });
  });

  it('배송비가 돌려줄 것보다 크면 부분 취소를 거절한다', () => {
    // 1,000원짜리를 취소하면 남는 49,000원에 배송비 3,000원이 붙는다
    expect(() => planPartialCancel(input({
      lines: [line('a', 49_000), line('b', 1_000)],
      cancelIds: ['b'],
    }))).toThrow(expect.objectContaining({ code: 'SHIPPING_EXCEEDS_REFUND' }));
  });

  it('남는 줄이 없으면 전액 취소로 보낸다', () => {
    expect(() => planPartialCancel(input({
      lines: [line('a', 10_000), line('b', 10_000, { canceled: true })],
      cancelIds: ['a'],
    }))).toThrow(expect.objectContaining({ code: 'ALL_ITEMS' }));
  });

  it('이미 취소된 줄·없는 줄·빈 목록을 거절한다', () => {
    const lines = [line('a', 10_000, { canceled: true }), line('b', 10_000), line('c', 10_000)];
    const code = (ids: string[]) => {
      try {
        planPartialCancel(input({ lines, cancelIds: ids }));
        return null;
      } catch (e) {
        return (e as PartialCancelError).code;
      }
    };
    expect(code(['a'])).toBe('ALREADY_CANCELED');
    expect(code(['zzz'])).toBe('UNKNOWN_ITEM');
    expect(code([])).toBe('NO_ITEMS');
  });
});

describe('옛 주문', () => {
  it('줄에 몫이 없으면 전 줄을 판매가 비율로 나누고, 합은 주문과 같다', () => {
    const lines = [
      line('a', 30_000, { couponShare: null, pointsShare: null, rewardShare: null }),
      line('b', 70_000, { couponShare: null, pointsShare: null, rewardShare: null }),
    ];
    const shares = sharesOf(lines, { couponDiscount: 5_001, pointsUsed: 2_000, rewardPoints: 930 });
    expect(shares.reduce((a, s) => a + s.couponShare, 0)).toBe(5_001);
    expect(shares.reduce((a, s) => a + s.pointsShare, 0)).toBe(2_000);
    expect(shares.reduce((a, s) => a + s.rewardShare, 0)).toBe(930);
  });
});

describe('남은 것을 전부 되돌리기', () => {
  it('앞선 부분 취소가 돌려준 만큼을 뺀다 — 같은 돈이 두 번 나가지 않는다', () => {
    expect(remainingRefund({ payable: 57_000, cashRefunded: 27_000, pointsUsed: 10_000, pointsReturned: 3_000 }))
      .toEqual({ cash: 30_000, points: 7_000 });
  });

  it('부분 취소 뒤 전액 취소의 합은 처음부터 전액 취소한 것과 같다 — 뗀 배송비까지 돌아온다', () => {
    const lines = [line('a', 30_000), line('b', 30_000)];
    const payable = 60_000; // 무료배송
    const partial = planPartialCancel(input({ lines, cancelIds: ['b'] }));
    const rest = remainingRefund({ payable, cashRefunded: partial.cash, pointsUsed: 0, pointsReturned: 0 });
    expect(partial.cash + rest.cash).toBe(payable);
  });
});
