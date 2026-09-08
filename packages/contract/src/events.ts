import { z } from 'zod';
import { MAX_EVENTS_PER_BATCH, WEB_VITAL } from '@shop/core';
import { cuidSchema, orderNoSchema, quantitySchema, wonSchema } from './common';

/**
 * 이벤트 수집 계약.
 *
 * 이벤트별로 필요한 속성이 다르므로 discriminated union 으로 묶는다.
 * 이름 오타나 속성 누락이 타입과 검증 양쪽에서 걸린다.
 *
 * 이름 목록은 packages/core 의 COMMERCE_EVENT 와 같아야 한다 —
 * 정합성은 테스트가 강제한다.
 */

/** 브라우저가 만든 식별자. 길이와 문자를 제한해 이상한 값이 들어오는 걸 막는다. */
const clientIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'valid.idFormat');

/** 앱 내부 경로만 받는다. 절대 URL 을 그대로 저장하면 외부 도메인이 섞인다. */
const pathSchema = z.string().min(1).max(512).startsWith('/', 'valid.pathFormat');

const base = z.object({
  occurredAt: z.iso.datetime({ offset: true }),
  sessionId: clientIdSchema,
  anonymousId: clientIdSchema,
  path: pathSchema,
  referrer: z.string().max(1024).nullish(),
});

const ev = <N extends string, S extends z.ZodRawShape>(name: N, shape: S) =>
  base.extend({ name: z.literal(name), ...shape });

export const eventInputSchema = z.discriminatedUnion('name', [
  ev('page_view', {}),
  ev('view_item_list', {
    listId: z.string().max(64).optional(),
    itemCount: z.int().min(0).max(500).optional(),
  }),
  ev('view_item', { productId: cuidSchema, variantId: cuidSchema.optional() }),
  ev('select_item', { productId: cuidSchema, listId: z.string().max(64).optional() }),
  ev('add_to_cart', { productId: cuidSchema, variantId: cuidSchema, quantity: quantitySchema }),
  ev('remove_from_cart', { productId: cuidSchema, variantId: cuidSchema, quantity: quantitySchema }),
  ev('view_cart', { itemCount: z.int().min(0).max(200) }),
  ev('begin_checkout', { itemCount: z.int().min(1).max(200) }),
  ev('add_shipping_info', { method: z.string().max(32).optional() }),
  ev('add_payment_info', { method: z.string().max(32).optional() }),
  ev('add_to_wishlist', { productId: cuidSchema }),
  /*
   * 어떤 길로 나갔는지(method)를 함께 남긴다. 네이티브 공유 시트로 나간
   * 것과 주소를 복사한 것은 뜻이 다르다 — 뒤엣것은 공유할 곳을 못 찾아
   * 직접 옮긴 것에 가깝다.
   */
  ev('share', { productId: cuidSchema, method: z.string().max(32) }),
  ev('search', { query: z.string().trim().min(1).max(128), resultCount: z.int().min(0).optional() }),
  ev('login', { method: z.string().max(32).optional() }),
  ev('sign_up', { method: z.string().max(32).optional() }),
  // purchase / refund 는 서버만 기록한다. 수집 API 가 이름으로 거부하므로
  // 여기 정의는 서버 측 기록 함수의 타입을 위한 것이다.
  ev('purchase', { orderId: orderNoSchema, value: wonSchema, itemCount: z.int().min(1) }),
  ev('refund', { orderId: orderNoSchema, value: wonSchema }),
  /*
   * 실사용자 성능.
   *
   * **값의 상한을 둔다.** 브라우저가 보내는 값이라 아무 숫자나 올 수 있고,
   * 하나가 터무니없이 크면 백분위가 통째로 끌려간다 — 탭을 열어 두고 며칠
   * 뒤 돌아온 사람의 LCP 같은 것이 그렇다. 10분을 넘는 값은 성능이 아니라
   * 잡음이다.
   */
  ev('web_vitals', {
    metric: z.enum(WEB_VITAL),
    value: z.number().min(0).max(600_000),
    rating: z.enum(['good', 'needs-improvement', 'poor']),
    navigationType: z.string().max(24).optional(),
  }),
]);

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventName = EventInput['name'];

export const eventBatchSchema = z.object({
  events: z
    .array(eventInputSchema)
    .min(1, 'valid.eventsEmpty')
    .max(MAX_EVENTS_PER_BATCH, 'valid.eventsTooMany'),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

// 계약을 통해 쓰던 곳이 깨지지 않게 그대로 다시 내보낸다
export { MAX_EVENTS_PER_BATCH };

export const eventBatchResponseSchema = z.object({
  accepted: z.int().min(0),
  rejected: z.int().min(0),
});
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;
