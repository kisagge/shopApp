import { z } from 'zod';
import { cuidSchema, quantitySchema, wonSchema } from './common';

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
  .regex(/^[A-Za-z0-9_-]{8,64}$/, '식별자 형식이 올바르지 않습니다');

/** 앱 내부 경로만 받는다. 절대 URL 을 그대로 저장하면 외부 도메인이 섞인다. */
const pathSchema = z.string().min(1).max(512).startsWith('/', '경로는 / 로 시작해야 합니다');

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
  ev('search', { query: z.string().trim().min(1).max(128), resultCount: z.int().min(0).optional() }),
  ev('login', { method: z.string().max(32).optional() }),
  ev('sign_up', { method: z.string().max(32).optional() }),
  // purchase / refund 는 서버만 기록한다. 수집 API 가 이름으로 거부하므로
  // 여기 정의는 서버 측 기록 함수의 타입을 위한 것이다.
  ev('purchase', { orderId: cuidSchema, value: wonSchema, itemCount: z.int().min(1) }),
  ev('refund', { orderId: cuidSchema, value: wonSchema }),
]);

export type EventInput = z.infer<typeof eventInputSchema>;
export type EventName = EventInput['name'];

/** 한 번에 보낼 수 있는 이벤트 수. 브라우저 트래커의 배치 크기와 맞춘다. */
export const MAX_EVENTS_PER_BATCH = 20;

export const eventBatchSchema = z.object({
  events: z
    .array(eventInputSchema)
    .min(1, '이벤트가 비어 있습니다')
    .max(MAX_EVENTS_PER_BATCH, `한 번에 ${MAX_EVENTS_PER_BATCH}개까지 보낼 수 있습니다`),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

export const eventBatchResponseSchema = z.object({
  accepted: z.int().min(0),
  rejected: z.int().min(0),
});
export type EventBatchResponse = z.infer<typeof eventBatchResponseSchema>;
