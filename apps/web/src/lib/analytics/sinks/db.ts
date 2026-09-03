import 'server-only';
import { prisma, Prisma } from '@shop/db';
import type { EventSink, TrackedEvent } from '@shop/core';

/**
 * 이벤트를 우리 Postgres 에 적재하는 싱크.
 *
 * createMany 로 한 번에 넣는다. 이벤트마다 INSERT 를 날리면 배치의 의미가 없다.
 * skipDuplicates 는 쓰지 않는다 — 이벤트에는 고유 제약이 없고, 중복은
 * 재전송(beacon 실패 후 fetch 재시도)에서 나올 수 있는 정상적인 잡음이다.
 */
export const dbSink: EventSink = {
  name: 'db',
  async send(events: readonly TrackedEvent[]) {
    if (events.length === 0) return;
    await prisma.eventLog.createMany({
      data: events.map((e) => ({
        name: e.name,
        occurredAt: e.occurredAt,
        sessionId: e.sessionId,
        anonymousId: e.anonymousId,
        userId: e.userId,
        path: e.path,
        referrer: e.referrer,
        productId: e.productId,
        variantId: e.variantId,
        orderId: e.orderId,
        merchantId: e.merchantId,
        value: e.value,
        quantity: e.quantity,
        deviceType: e.deviceType,
        ipHash: e.ipHash,
        /**
         * props 는 이벤트마다 모양이 다른 자유 형식이라 Readonly 로 들고 있는데,
         * Prisma 의 Json 입력 타입은 그것을 받지 못한다. 단언이 필요하다.
         *
         * eslint 의 no-unnecessary-type-assertion 이 이 단언을 불필요하다고
         * 판단해 지운 적이 있다 — 지우면 타입이 깨진다.
         */
        props: e.props as Prisma.InputJsonValue,
      })),
    });
  },
};
