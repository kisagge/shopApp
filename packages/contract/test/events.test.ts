import { describe, it, expect } from 'vitest';
import { COMMERCE_EVENT, DIAGNOSTIC_EVENT } from '@shop/core';
import { eventInputSchema, eventBatchSchema, MAX_EVENTS_PER_BATCH } from '../src/events';

const envelope = {
  occurredAt: '2026-08-31T05:00:00.000Z',
  sessionId: 'sess_abcdefgh',
  anonymousId: 'anon_abcdefgh',
  path: '/product/oversized-wool-coat',
};

describe('이벤트 이름 정합성', () => {
  /** discriminatedUnion 의 각 갈래에서 name 리터럴 값을 뽑는다 */
  const contractNames = (eventInputSchema.options as readonly unknown[]).map(
    (o) => (o as { shape: Record<string, { value: string }> }).shape['name']!.value,
  );

  it('계약의 이름 집합이 core 의 목록과 정확히 같다', () => {
    // 한쪽에만 이벤트를 추가하면 여기서 걸린다.
    // 계약에만 있으면 core 의 퍼널·동의 판정이 그 이벤트를 모르고,
    // core 에만 있으면 브라우저가 보낼 수 없다.
    expect(contractNames.toSorted()).toEqual(
      [...COMMERCE_EVENT, ...DIAGNOSTIC_EVENT].toSorted(),
    );
  });

  it('장사 이벤트와 진단 이벤트가 겹치지 않는다', () => {
    /*
     * COMMERCE_EVENT 는 GA4 권장 이름을 그대로 따르기로 한 목록이다.
     * 거기에 우리가 지은 이름이 섞이면 나중에 내보낼 때 매핑 표가 다시 생긴다.
     */
    const commerce = new Set<string>(COMMERCE_EVENT);
    expect(DIAGNOSTIC_EVENT.filter((n) => commerce.has(n))).toEqual([]);
  });
});

describe('eventInputSchema', () => {
  it('알 수 없는 이벤트 이름을 거부한다', () => {
    const r = eventInputSchema.safeParse({ ...envelope, name: 'veiw_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' });
    expect(r.success).toBe(false);
  });

  it('view_item 은 productId 가 없으면 거부한다', () => {
    expect(eventInputSchema.safeParse({ ...envelope, name: 'view_item' }).success).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...envelope, name: 'view_item', productId: 'cmtgrsyc8000hx9oh6tozfnvx' }).success,
    ).toBe(true);
  });

  it('add_to_cart 는 수량이 1 이상이어야 한다', () => {
    const bad = { ...envelope, name: 'add_to_cart', productId: 'cmtgrsyc8000hx9oh6tozfnvx', variantId: 'cmtgrsydv0011x9ohazcdqo6p', quantity: 0 };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...bad, quantity: 2 }).success).toBe(true);
  });

  it('경로는 / 로 시작해야 한다 — 외부 URL 이 섞이면 안 된다', () => {
    const bad = { ...envelope, path: 'https://evil.test/steal', name: 'page_view' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });

  it('식별자 길이와 문자를 제한한다', () => {
    expect(
      eventInputSchema.safeParse({ ...envelope, sessionId: 'a', name: 'page_view' }).success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...envelope, sessionId: 'x'.repeat(200), name: 'page_view' })
        .success,
    ).toBe(false);
    expect(
      eventInputSchema.safeParse({ ...envelope, sessionId: '<script>aaa', name: 'page_view' })
        .success,
    ).toBe(false);
  });

  it('시각은 오프셋이 있는 ISO 문자열이어야 한다', () => {
    const bad = { ...envelope, occurredAt: '2026-08-31 05:00:00', name: 'page_view' };
    expect(eventInputSchema.safeParse(bad).success).toBe(false);
  });

  it('검색어는 앞뒤 공백을 다듬고 길이를 제한한다', () => {
    const r = eventInputSchema.safeParse({ ...envelope, name: 'search', query: '  코트  ' });
    expect(r.success).toBe(true);
    expect(r.success && r.data.name === 'search' && r.data.query).toBe('코트');
    expect(
      eventInputSchema.safeParse({ ...envelope, name: 'search', query: 'x'.repeat(200) }).success,
    ).toBe(false);
  });

  it('purchase 는 금액이 정수여야 한다', () => {
    const base = { ...envelope, name: 'purchase', orderId: '20260901-1234567', itemCount: 2 };
    expect(eventInputSchema.safeParse({ ...base, value: 405_000 }).success).toBe(true);
    expect(eventInputSchema.safeParse({ ...base, value: 405_000.5 }).success).toBe(false);
    expect(eventInputSchema.safeParse({ ...base, value: -1 }).success).toBe(false);
  });
});

describe('eventBatchSchema', () => {
  const one = { ...envelope, name: 'page_view' as const };

  it('빈 배치를 거부한다', () => {
    expect(eventBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it(`한 번에 ${MAX_EVENTS_PER_BATCH}개까지만 받는다`, () => {
    const ok = Array.from({ length: MAX_EVENTS_PER_BATCH }, () => one);
    expect(eventBatchSchema.safeParse({ events: ok }).success).toBe(true);
    expect(eventBatchSchema.safeParse({ events: [...ok, one] }).success).toBe(false);
  });

  it('한 건이라도 잘못되면 어느 인덱스인지 알려준다', () => {
    const r = eventBatchSchema.safeParse({ events: [one, { ...one, path: 'bad' }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path.slice(0, 2)).toEqual(['events', 1]);
  });
});
