import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { LOCALES } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import {
  addressInputSchema, claimCouponSchema, createOrderRequestSchema,
  createProductSchema, createReviewSchema, cartSyncSchema, supportPostSchema,
} from '@shop/contract';
import { translateIssue, type IssueBounds } from '~/lib/i18n/issue';

/**
 * 제약을 실제로 어겼을 때 **사람의 말이 나오는지** 본다.
 *
 * 짝이 되는 검사가 둘 더 있다. 계약 쪽 `validation-message-coverage` 는
 * 문구가 붙어 있는지를, 이 파일 옆의 `validation-messages` 는 그 열쇠가
 * 사전에 있는지를 본다. 둘 다 통과해도 **`{max}` 가 그대로 남는** 경우가
 * 있다 — 열쇠는 자리표시자를 쓰는데 Zod 이슈가 그 숫자를 안 실어 주면
 * 사용자에게 `{max}자를 넘을 수 없습니다` 가 보인다. 그건 여기서만 잡힌다.
 */

const t = createTranslator('ko');

/** 이 스키마의 이 입력은 이 칸에서 걸린다 */
const CASES: ReadonlyArray<readonly [string, z.ZodType, unknown, string]> = [
  ['쿠폰 코드 길이', claimCouponSchema, { code: 'A'.repeat(31) }, 'code'],
  ['주소 상세 길이', addressInputSchema, {
    recipient: '홍길동', phone: '010-1234-5678', postalCode: '06236',
    address1: '서울시', address2: '가'.repeat(201),
  }, 'address2'],
  ['상품 설명 길이', createProductSchema, { description: '가'.repeat(4001) }, 'description'],
  ['리뷰 키 하한', createReviewSchema, { height: 50 }, 'height'],
  ['리뷰 키 상한', createReviewSchema, { height: 300 }, 'height'],
  ['장바구니 줄 수', cartSyncSchema, {
    lines: Array.from({ length: 200 }, () => ({ variantId: 'x'.repeat(25), quantity: 1 })),
  }, 'lines'],
  ['배송 메모 길이', createOrderRequestSchema, { deliveryMemo: '가'.repeat(101) }, 'deliveryMemo'],
  ['정렬 순서 상한', supportPostSchema, { sortOrder: 10_000 }, 'sortOrder'],
];

/** 이 칸에서 나온 문구를 사람의 말로 바꾼 것 */
function messageFor(schema: z.ZodType, input: unknown, field: string): string | null {
  const parsed = schema.safeParse(input);
  if (parsed.success) return null;
  const issue = parsed.error.issues.find((i) => i.path.join('.') === field);
  return issue ? translateIssue(t, issue.message, issue as IssueBounds) : null;
}

describe('제약을 어겼을 때 나오는 말', () => {
  it.each(CASES)('%s — 우리 말로 답한다', (_label, schema, input, field) => {
    const message = messageFor(schema, input, field);

    expect(message, `${field} 에서 걸리지 않았다 — 입력이나 스키마가 바뀌었다`).not.toBeNull();
    // 영어 단어가 이어지면 Zod 의 기본 문구가 새어 나온 것이다
    expect(message, 'Zod 기본 문구가 그대로 나간다').not.toMatch(/[A-Za-z]{4,}/);
  });

  it.each(CASES)('%s — 자리표시자가 그대로 남지 않는다', (_label, schema, input, field) => {
    const message = messageFor(schema, input, field);

    expect(message, '열쇠는 숫자를 받는데 이슈가 그 숫자를 싣지 않았다').not.toMatch(/\{\w+\}/);
  });

  it.each(CASES)('%s — 세 언어 모두 답한다', (_label, schema, input, field) => {
    for (const locale of LOCALES) {
      const parsed = schema.safeParse(input);
      expect(parsed.success).toBe(false);
      if (parsed.success) continue;
      const issue = parsed.error.issues.find((i) => i.path.join('.') === field)!;
      const message = translateIssue(createTranslator(locale), issue.message, issue as IssueBounds);
      expect(message.trim(), `${locale}/${field}`).not.toBe('');
      expect(message, `${locale}/${field}`).not.toMatch(/\{\w+\}/);
    }
  });
});
