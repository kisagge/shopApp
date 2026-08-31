import type { EventSink, TrackedEvent } from '@shop/core';

/** 개발 중 눈으로 확인하는 용도. 프로덕션에서는 붙이지 않는다. */
export const consoleSink: EventSink = {
  name: 'console',
  send(events: readonly TrackedEvent[]) {
    for (const e of events) {
      const detail = [
        e.productId && `product=${e.productId}`,
        e.orderId && `order=${e.orderId}`,
        e.value !== null && `value=${e.value}`,
        e.quantity !== null && `qty=${e.quantity}`,
      ]
        .filter(Boolean)
        .join(' ');
      console.info(`[event] ${e.name} ${e.path} ${detail}`.trimEnd());
    }
    return Promise.resolve();
  },
};
