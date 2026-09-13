import { describe, it, expect, vi } from 'vitest';
import type { TrackedEvent } from '@shop/core';
import { toTrackedEvent, withMerchant } from '~/lib/analytics/server';

/**
 * 이벤트에 가맹점을 다는 일.
 *
 * **칸은 처음부터 있었는데 아무도 안 채웠다.** 개발 DB 를 세어 보니 1만
 * 7천 건 중 **0건**이었다 — 그래서 가맹점은 자기 상품이 몇 번 조회되고 몇 번
 * 담기는지 볼 방법이 없었다. 대시보드가 퍼널을 안 준 이유이기도 하다.
 *
 * 값은 **상품에서 끌어온다.** 브라우저가 적어 보내게 하면 아무나 남의 가맹점
 * 지표를 부풀리거나 더럽힐 수 있다 — userId 를 세션에서만 읽는 것과 같은 이유다.
 */

const ctx = { userId: null, ipHash: null, deviceType: 'desktop' };

const input = (over: Record<string, unknown> = {}) => ({
  name: 'view_item' as const,
  occurredAt: new Date('2026-09-13T00:00:00Z').toISOString(),
  sessionId: 's-1',
  anonymousId: 'a-1',
  path: '/product/coat',
  ...over,
});

describe('이벤트의 가맹점', () => {
  it('본문에 적어 보낸 가맹점은 쓰지 않는다', () => {
    /*
     * **여기가 이 파일의 요점이다.** 이 값은 가맹점이 자기 지표를 보는
     * 근거다. 요청을 믿으면 남의 id 를 적어 넣어 그쪽 숫자를 흔들 수 있다.
     */
    const event = toTrackedEvent(
      input({ productId: 'p-1', merchantId: '남의-가맹점' }) as never,
      ctx,
    );
    expect(event.merchantId, '본문의 가맹점 id 가 그대로 실렸다').toBeNull();
  });

  it('상품에서 끌어와 단다', async () => {
    const lookup = vi.fn().mockResolvedValue(new Map([['p-1', 'm-1']]));
    const events = [toTrackedEvent(input({ productId: 'p-1' }) as never, ctx)];

    const [tagged] = await withMerchant(events, lookup);

    expect(tagged?.merchantId).toBe('m-1');
    expect(lookup).toHaveBeenCalledWith(['p-1']);
  });

  it('한 묶음에 조회 한 번만 쓴다', async () => {
    /*
     * 이벤트는 스무 개씩 온다. 하나씩 물으면 수집 창구가 느려지고, 느려지면
     * **브라우저가 떠날 때 보내는 것부터 잘린다** — 하필 이탈 분석에 가장
     * 중요한 이벤트다.
     */
    const lookup = vi.fn().mockResolvedValue(new Map([['p-1', 'm-1'], ['p-2', 'm-2']]));
    const events = ['p-1', 'p-2', 'p-1', 'p-2'].map((productId) =>
      toTrackedEvent(input({ productId }) as never, ctx),
    );

    const tagged = await withMerchant(events, lookup);

    expect(lookup).toHaveBeenCalledTimes(1);
    expect(lookup.mock.calls[0]?.[0], '같은 상품을 두 번 물었다').toEqual(['p-1', 'p-2']);
    expect(tagged.map((e) => e.merchantId)).toEqual(['m-1', 'm-2', 'm-1', 'm-2']);
  });

  it('상품이 없는 이벤트는 아무것도 묻지 않는다', async () => {
    // 화면 이동이나 검색처럼 상품과 무관한 이벤트가 대부분이다
    const lookup = vi.fn();
    const events = [toTrackedEvent(input({ name: 'search' }) as never, ctx)];

    expect(await withMerchant(events, lookup)).toEqual(events);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('가맹점 없는 상품은 빈 채로 둔다', async () => {
    // 자체 상품이거나 지워진 상품이다. 억지로 채우면 남의 지표가 된다.
    const lookup = vi.fn().mockResolvedValue(new Map([['p-1', null]]));
    const events: TrackedEvent[] = [toTrackedEvent(input({ productId: 'p-1' }) as never, ctx)];

    expect((await withMerchant(events, lookup))[0]?.merchantId).toBeNull();
  });
});
