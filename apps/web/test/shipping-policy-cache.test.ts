import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DEFAULT_SHIPPING } from '@shop/core';

/**
 * 배송 정책은 **한 줄짜리 표인데 가장 자주 읽히는 값**이다.
 *
 * 상품 화면·장바구니 견적·체크아웃·주문 생성이 저마다 읽는다. 예전에는 그 한 줄을
 * 요청마다 DB 에 물었다 — 손님이 보고 담고 결제하는 동안 같은 답을 세 번 넘게 받아 왔고,
 * DB 가 바다 건너에 있으니 그때마다 왕복이 붙었다.
 *
 * 캐시를 씌우면 두 가지가 위험해진다. **무효화를 빠뜨리는 것**(고친 기준이 안 서는 것)과,
 * **실패를 캐시에 넣는 것**이다. 여기서 보는 것이 그 둘이다.
 */

const db = vi.hoisted(() => ({
  shippingPolicy: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

/** cachedRead 에 무엇을 건넸는지 들여다본다 — 태그가 없으면 무효화가 닿지 않는다 */
const caught = vi.hoisted(() => ({
  options: null as { key: readonly string[]; tags: readonly string[]; revalidate: number } | null,
  inner: null as (() => Promise<unknown>) | null,
}));
vi.mock('~/lib/cache', () => ({
  cachedRead: (fn: () => Promise<unknown>, options: any) => {
    caught.inner = fn;
    caught.options = options;
    return fn;
  },
  TAG: { shipping: 'shipping' },
  TTL: { shipping: 300 },
}));

const { getShippingPolicy } = await import('~/lib/shipping-policy');

const ROW = { baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000 };

beforeEach(() => {
  vi.clearAllMocks();
  db.shippingPolicy.findUnique.mockResolvedValue(ROW);
});

describe('배송 정책 읽기', () => {
  it('값을 읽어 정책으로 옮긴다', async () => {
    expect(await getShippingPolicy()).toMatchObject({
      baseFee: 3000, freeThreshold: 50_000, remoteSurcharge: 3000,
    });
  });

  it('배송 태그를 달고 읽는다 — 태그가 없으면 고쳐도 옛 기준이 남는다', () => {
    expect(caught.options?.tags).toEqual(['shipping']);
    expect(caught.options?.revalidate).toBe(300);
  });

  it('숫자 세 칸만 읽는다 — 캐시를 지나면 Date 는 문자열이 된다', async () => {
    await getShippingPolicy();

    expect(db.shippingPolicy.findUnique.mock.calls[0]![0].select).toEqual({
      baseFee: true, freeThreshold: true, remoteSurcharge: true,
    });
  });

  it('줄이 없으면 코드의 바닥값으로 간다 — 마이그레이션과 시드 사이에도 가게는 돈다', async () => {
    db.shippingPolicy.findUnique.mockResolvedValue(null);

    expect(await getShippingPolicy()).toEqual(DEFAULT_SHIPPING);
  });

  /**
   * **바닥값은 캐시에 들어가면 안 된다.**
   *
   * try 를 캐시 안쪽에 두면 DB 가 잠깐 흔들린 그 한 번이 수명 내내 굳는다 — 멀쩡해진
   * 뒤에도 가게가 계속 기본 배송비로 판다. 넘어지는 것은 캐시 바깥에서 받아야 한다.
   */
  it('못 읽으면 바닥값을 주되, 캐시에 담기는 쪽은 넘어진다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    db.shippingPolicy.findUnique.mockRejectedValue(new Error('DB 가 안 열린다'));

    expect(await getShippingPolicy()).toEqual(DEFAULT_SHIPPING);
    expect(error).toHaveBeenCalled();

    // 캐시가 감싼 함수 자체는 삼키지 않는다 — 삼키면 그 바닥값이 저장된다
    await expect(caught.inner!()).rejects.toThrow('DB 가 안 열린다');
  });
});
