import { describe, it, expect } from 'vitest';
import { INQUIRY_MAX_LENGTH, ANSWER_MAX_LENGTH } from '@shop/core';
import { createInquirySchema, answerInquirySchema } from '../src/inquiry';

/**
 * 문의와 답변의 **길이 경계**.
 *
 * **상한만 있고 그 상한을 확인한 적이 없었다.** 화면은 `maxLength` 로 막지만 창구를 직접 부르면
 * 그 숫자는 아무 뜻이 없다 — 계약이 유일한 문지기다. 그런데 이 파일에는 검사가 없었고,
 * **답변 스키마는 한 줄도 없었다.**
 *
 * 경계가 틀리면 조용하다: 상한에 꼭 맞는 글이 거절되면 사람은 긴 글을 다시 쓰다 포기하고,
 * 상한을 넘겨도 받아 주면 운영 화면의 표가 한 줄로 터진다.
 *
 * (상품도 갈래도 없는 문의를 거절하는 규칙은 `support.test.ts` 가 이미 본다 — 거기에 두고 여기서
 * 다시 적지 않는다.)
 */

const text = (length: number) => 'ㄱ'.repeat(length);
const inquiry = (over: Record<string, unknown> = {}) => ({
  productId: 'cmtgrsydv0011x9ohazcdqo6p',
  content: text(10),
  ...over,
});

describe('문의 내용의 길이', () => {
  it('상한과 꼭 같은 길이는 그대로 받는다', () => {
    const r = createInquirySchema.safeParse(inquiry({ content: text(INQUIRY_MAX_LENGTH) }));

    expect(r.success).toBe(true);
  });

  it('한 글자 더 길면 사전 열쇠로 거절한다', () => {
    const r = createInquirySchema.safeParse(inquiry({ content: text(INQUIRY_MAX_LENGTH + 1) }));

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.tooLongChars');
  });

  /** 다듬은 뒤 길이로 잰다 — 공백으로 상한을 넘기는 글이 거절되면 사람은 까닭을 모른다 */
  it('앞뒤 공백은 길이에 세지 않는다', () => {
    const padded = `   ${text(INQUIRY_MAX_LENGTH)}   `;

    expect(createInquirySchema.safeParse(inquiry({ content: padded })).success).toBe(true);
  });

  it('다섯 글자는 받고 네 글자는 거절한다', () => {
    expect(createInquirySchema.safeParse(inquiry({ content: text(5) })).success).toBe(true);
    expect(createInquirySchema.safeParse(inquiry({ content: text(4) })).success).toBe(false);
  });

  /** 공백만 적어 보내면 다듬은 뒤 빈 글이다 — "다섯 글자" 와 같은 까닭으로 거절한다 */
  it('공백만 있는 글은 거절한다', () => {
    expect(createInquirySchema.safeParse(inquiry({ content: '      ' })).success).toBe(false);
  });
});

describe('답변의 길이', () => {
  it('상한과 꼭 같은 길이는 그대로 받는다', () => {
    expect(answerInquirySchema.safeParse({ answer: text(ANSWER_MAX_LENGTH) }).success).toBe(true);
  });

  it('한 글자 더 길면 거절한다', () => {
    const r = answerInquirySchema.safeParse({ answer: text(ANSWER_MAX_LENGTH + 1) });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.tooLongChars');
  });

  it('공백만 있는 답변은 사전 열쇠로 거절한다', () => {
    const r = answerInquirySchema.safeParse({ answer: '   ' });

    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.answerRequired');
  });

  it('다듬어 저장한다 — 앞뒤 공백이 그대로 남으면 화면에서 줄이 밀린다', () => {
    const r = answerInquirySchema.safeParse({ answer: '  답변입니다  ' });

    expect(r.success && r.data.answer).toBe('답변입니다');
  });

  /** 물음보다 답이 짧을 이유가 없다 — 상한을 고치다 뒤집히면 긴 답을 못 쓴다 */
  it('답변 상한이 문의 상한보다 크다', () => {
    expect(ANSWER_MAX_LENGTH).toBeGreaterThan(INQUIRY_MAX_LENGTH);
  });
});
