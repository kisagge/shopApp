import 'server-only';
import { createHash } from 'node:crypto';
import { fanOut, type EventSink, type TrackedEvent } from '@shop/core';
import type { EventInput } from '@shop/contract';
import { dbSink } from './sinks/db';
import { consoleSink } from './sinks/console';

/**
 * 서버 쪽 이벤트 기록.
 *
 * 여기가 이벤트의 유일한 출구다. 수집 API 도, 주문 확정 코드도 이 함수를 거친다.
 * 싱크를 늘리려면 sinks 배열에 추가하기만 하면 된다 (PostHog 등).
 */

const sinks: EventSink[] = [dbSink];
if (process.env.NODE_ENV === 'development') sinks.push(consoleSink);

const sink = fanOut(sinks, (name, error) => {
  console.error(`[analytics] ${name} 싱크 전송 실패`, error);
});

/**
 * IP 를 그대로 저장하지 않는다.
 *
 * 날짜를 섞어 해시하므로 같은 IP도 날이 바뀌면 다른 값이 된다.
 * 하루 단위 봇·어뷰징 판별에는 충분하고, 장기 추적은 불가능하다.
 */
export function hashIp(ip: string | null, date: Date = new Date()): string | null {
  if (!ip) return null;
  const salt = process.env.EVENT_IP_SALT ?? 'dev-salt';
  const day = date.toISOString().slice(0, 10);
  return createHash('sha256').update(`${salt}:${day}:${ip}`).digest('hex').slice(0, 32);
}

/** User-Agent 를 세 갈래로만 축약한다. 원본은 저장하지 않는다. */
export function deviceTypeOf(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|playbook|silk/.test(ua)) return 'tablet';
  if (/mobi|iphone|android|phone/.test(ua)) return 'mobile';
  return 'desktop';
}

export interface CollectionContext {
  /** 세션에서 읽은 값. 요청 본문의 userId 는 절대 믿지 않는다. */
  readonly userId: string | null;
  readonly ipHash: string | null;
  readonly deviceType: string | null;
}

/** 검증된 입력을 저장 가능한 형태로 옮긴다. 서버가 정하는 값은 여기서 덮어쓴다. */
export function toTrackedEvent(input: EventInput, ctx: CollectionContext): TrackedEvent {
  const { name, occurredAt, sessionId, anonymousId, path, referrer, ...rest } = input;
  const props = rest as Record<string, unknown>;

  const pick = (key: string): string | null => {
    const v = props[key];
    return typeof v === 'string' ? v : null;
  };
  const pickNum = (key: string): number | null => {
    const v = props[key];
    return typeof v === 'number' ? v : null;
  };

  return {
    name: name,
    occurredAt: new Date(occurredAt),
    sessionId,
    anonymousId,
    userId: ctx.userId,
    path,
    referrer: referrer ?? null,
    productId: pick('productId'),
    variantId: pick('variantId'),
    orderId: pick('orderId'),
    /*
     * **브라우저가 보낸 가맹점 id 는 쓰지 않는다.**
     *
     * 이 값은 가맹점이 자기 상품의 조회·전환을 보는 근거가 된다. 요청 본문을
     * 믿으면 아무나 남의 가맹점 id 를 적어 넣어 그쪽 지표를 부풀리거나
     * 더럽힐 수 있다 — userId 를 세션에서만 읽는 것과 같은 이유다.
     *
     * 상품에서 끌어온다(`withMerchant`). 여기서는 자리만 비워 둔다.
     */
    merchantId: null,
    value: pickNum('value'),
    quantity: pickNum('quantity'),
    deviceType: ctx.deviceType,
    ipHash: ctx.ipHash,
    props,
  };
}

export const recordEvents = (events: readonly TrackedEvent[]): Promise<void> => sink.send(events);

/**
 * 서버에서만 기록하는 이벤트(purchase·refund).
 *
 * 주문 확정·환불 처리 코드에서 부른다. 브라우저가 보낸 것은 수집 API 가 거부하므로
 * 매출 이벤트는 이 경로로만 들어온다.
 */
export function recordServerEvent(
  event: Omit<TrackedEvent, 'deviceType' | 'ipHash' | 'referrer'> &
    Partial<Pick<TrackedEvent, 'deviceType' | 'ipHash' | 'referrer'>>,
): Promise<void> {
  return recordEvents([
    { referrer: null, deviceType: null, ipHash: null, ...event },
  ]);
}

/**
 * 이벤트에 가맹점을 달아 준다.
 *
 * **칸은 처음부터 있었는데 아무도 안 채웠다.** 재 보니 1만 7천 건 중 0건이었다 —
 * 그래서 가맹점은 자기 상품이 몇 번 조회됐는지 볼 방법이 없었다.
 *
 * **상품에서 끌어온다.** 브라우저가 적어 보내게 하면 남의 가맹점 지표를
 * 더럽힐 수 있고, 무엇보다 그 값은 서버가 이미 알고 있다.
 *
 * 한 묶음에 조회 한 번만 쓴다. 이벤트는 최대 20개씩 오는데 그것을 하나씩
 * 물으면 수집 창구가 화면보다 느려진다.
 */
export async function withMerchant(
  events: readonly TrackedEvent[],
  lookup: (productIds: readonly string[]) => Promise<ReadonlyMap<string, string | null>>,
): Promise<readonly TrackedEvent[]> {
  const productIds = [...new Set(events.map((e) => e.productId).filter((id): id is string => !!id))];
  if (productIds.length === 0) return events;

  const owner = await lookup(productIds);

  return events.map((e) =>
    e.productId ? { ...e, merchantId: owner.get(e.productId) ?? null } : e,
  );
}
