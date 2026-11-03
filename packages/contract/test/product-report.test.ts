import { describe, it, expect } from 'vitest';
import { PRODUCT_REPORT_REASON } from '@shop/core';
import { reportProductSchema } from '../src/product';

/**
 * 상품 신고 계약.
 *
 * **사유는 고르게 하고 설명은 선택이다.** 자유 입력만 받으면 분류가 안 되고, 무엇이
 * 문제인지 매번 읽어야 처리 순서를 정할 수 있다.
 */

const parse = (value: unknown) => reportProductSchema.safeParse(value);

describe('사유', () => {
  it.each(PRODUCT_REPORT_REASON)('%s 를 받는다', (reason) => {
    expect(parse({ reason }).success).toBe(true);
  });

  /** 리뷰 신고의 말이 그대로 오면 거절한다 — 두 집합을 섞지 않는 이유다 */
  it.each(['SPAM', 'ABUSE', 'PRIVACY', 'counterfeit', ''])('%s 는 거절한다', (reason) => {
    expect(parse({ reason }).success).toBe(false);
  });

  it('빠뜨리면 거절하고, 고르라고 말한다', () => {
    const result = parse({});

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('valid.reportReasonRequired');
  });
});

describe('설명', () => {
  it('없으면 null 이 된다 — 빈 글자와 "안 적었다" 를 같게 둔다', () => {
    const result = parse({ reason: 'OTHER' });

    expect(result.success && result.data.detail).toBeNull();
  });

  it('앞뒤 공백을 지운다', () => {
    const result = parse({ reason: 'OTHER', detail: '  짝퉁 같아요  ' });

    expect(result.success && result.data.detail).toBe('짝퉁 같아요');
  });

  it('상한까지는 받는다', () => {
    expect(parse({ reason: 'OTHER', detail: 'ㄱ'.repeat(500) }).success).toBe(true);
  });

  it('상한보다 하나 많으면 거절한다', () => {
    const result = parse({ reason: 'OTHER', detail: 'ㄱ'.repeat(501) });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain('valid.tooLongChars');
  });

  /** 다듬은 뒤의 길이로 잰다 — 공백으로 상한을 넘기면 거절할 이유가 없다 */
  it('공백을 지운 뒤의 길이로 잰다', () => {
    expect(parse({ reason: 'OTHER', detail: `  ${'ㄱ'.repeat(500)}  ` }).success).toBe(true);
  });

  it('null 을 그대로 받는다', () => {
    expect(parse({ reason: 'OTHER', detail: null }).success).toBe(true);
  });
});
