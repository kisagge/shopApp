import { describe, it, expect } from 'vitest';
import { DEFAULT_SHIPPING, shippingPolicyFrom, calculateShipping } from '../src/shipping';
import { won } from '../src/money';

/**
 * 바깥에서 온 숫자를 정책으로 세울 때.
 *
 * **정책 값이 운영 데이터가 되면 이상한 값이 들어올 수 있다.** 코드 상수일
 * 때는 그럴 일이 없었다 — 고치려면 배포를 해야 했고, 그 길에 타입 검사와
 * 리뷰가 있었다. 이제는 화면에서 숫자를 적어 넣는다.
 *
 * 음수 배송비나 정수가 아닌 값이 계산에 들어가면 금액이 통째로 이상해지는데,
 * 그것은 화면에서 알아보기 어렵다 — 100원 틀린 배송비를 누가 세어 보겠는가.
 * 읽는 자리에서 한 번 거른다.
 */

describe('배송 정책 세우기', () => {
  it('멀쩡한 값은 그대로 쓴다', () => {
    expect(shippingPolicyFrom({ baseFee: 2500, freeThreshold: 30_000, remoteSurcharge: 4000 })).toEqual({
      baseFee: won(2500),
      freeThreshold: won(30_000),
      remoteSurcharge: won(4000),
    });
  });

  it('무료배송을 안 하는 가게도 있다 — null 은 잘못된 값이 아니다', () => {
    /*
     * null 을 바닥값으로 되돌리면 "무료배송 없음" 을 고를 방법이 사라진다.
     * 비어 있는 것과 잘못된 것은 다르다.
     */
    const policy = shippingPolicyFrom({ baseFee: 3000, freeThreshold: null, remoteSurcharge: 3000 });
    expect(policy.freeThreshold).toBeNull();

    // 그리고 실제로 무료가 안 된다
    const huge = calculateShipping({ merchandiseTotal: won(10_000_000), isRemoteArea: false, policy });
    expect(huge.fee).toBe(won(3000));
  });

  it.each([
    ['음수 배송비', { baseFee: -1000, freeThreshold: 50_000, remoteSurcharge: 3000 }],
    ['소수점', { baseFee: 2500.5, freeThreshold: 50_000, remoteSurcharge: 3000 }],
    ['음수 추가금', { baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: -1 }],
  ])('%s 은 바닥값으로 되돌린다', (_label, row) => {
    const policy = shippingPolicyFrom(row);
    expect(policy.baseFee).toBeGreaterThanOrEqual(0);
    expect(policy.remoteSurcharge).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(policy.baseFee)).toBe(true);
  });

  it('어긋난 칸만 되돌린다 — 멀쩡한 칸까지 버리지 않는다', () => {
    /*
     * 한 칸이 이상하다고 정책 전체를 기본값으로 바꾸면, 운영이 바꿔 둔
     * 무료 기준까지 조용히 사라진다. 어느 칸이 되돌아갔는지도 알 수 없다.
     */
    const policy = shippingPolicyFrom({ baseFee: -1, freeThreshold: 30_000, remoteSurcharge: 4000 });
    expect(policy.baseFee).toBe(DEFAULT_SHIPPING.baseFee);
    expect(policy.freeThreshold).toBe(won(30_000));
    expect(policy.remoteSurcharge).toBe(won(4000));
  });

  it('세운 정책이 계산에 그대로 쓰인다', () => {
    // 세우기만 하고 계산에 안 들어가면 뜻이 없다
    const policy = shippingPolicyFrom({ baseFee: 2500, freeThreshold: 30_000, remoteSurcharge: 4000 });

    expect(calculateShipping({ merchandiseTotal: won(29_999), isRemoteArea: false, policy }).fee).toBe(won(2500));
    expect(calculateShipping({ merchandiseTotal: won(30_000), isRemoteArea: false, policy }).fee).toBe(won(0));
    expect(
      calculateShipping({ merchandiseTotal: won(30_000), isRemoteArea: true, policy }).fee,
    ).toBe(won(4000));
  });
});
