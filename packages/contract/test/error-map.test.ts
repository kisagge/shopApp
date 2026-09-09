import { describe, it, expect } from 'vitest';
import { z } from 'zod';
// 계약을 불러오는 것만으로 바닥이 깔려야 한다. 따로 부르는 함수가 아니다.
import { messageKeyForIssue } from '../src';

/**
 * 오류 문구의 바닥이 **불러오기만 해도 걸리는지** 본다.
 *
 * 부수효과로 거는 설정은 조용히 사라질 수 있다 — 번들러가 안 쓰는 모듈로
 * 보고 떼어 내거나, 누군가 index 에서 그 줄을 지우거나. 어느 쪽이든 아무것도
 * 터지지 않고 영어 문구만 다시 나오기 시작한다.
 */

describe('전역 바닥', () => {
  it('계약을 불러오면 걸려 있다', () => {
    const parsed = z.object({ a: z.string() }).safeParse({});

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message, '바닥이 안 걸렸다 — Zod 기본 문구가 나온다').toBe(
      'valid.required',
    );
  });

  it('붙여 둔 문구가 바닥보다 먼저다 — 바닥이지 덮개가 아니다', () => {
    const parsed = z.object({ a: z.string().max(3, 'valid.tooLongChars') }).safeParse({ a: 'abcd' });

    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0]?.message).toBe('valid.tooLongChars');
  });
});

describe('갈래별 열쇠', () => {
  it('빈 칸과 종류가 다른 것을 갈라 말한다 — 사람이 할 일이 다르다', () => {
    expect(messageKeyForIssue({ code: 'invalid_type', input: undefined })).toBe('valid.required');
    expect(messageKeyForIssue({ code: 'invalid_type', input: 3 })).toBe('valid.invalidType');
  });

  it.each([
    ['string', 'too_small', 'valid.tooShortChars'],
    ['string', 'too_big', 'valid.tooLongChars'],
    ['array', 'too_small', 'valid.tooFewItems'],
    ['array', 'too_big', 'valid.tooManyItems'],
    ['number', 'too_small', 'valid.tooSmall'],
    ['number', 'too_big', 'valid.tooBig'],
  ])('%s 의 %s 는 %s', (origin, code, key) => {
    expect(messageKeyForIssue({ code, origin })).toBe(key);
  });

  it('모르는 갈래는 하나로 묶는다 — 열쇠 없이 나가지 않는다', () => {
    expect(messageKeyForIssue({ code: 'not_multiple_of' })).toBe('valid.generic');
    expect(messageKeyForIssue({})).toBe('valid.generic');
  });

  /** 무엇이 오든 열쇠 모양이어야 한다. 아니면 번역되지 않고 그대로 나간다. */
  it.each([
    'invalid_type', 'invalid_value', 'invalid_format', 'too_small', 'too_big',
    'not_multiple_of', 'unrecognized_keys', 'invalid_key', 'invalid_element',
    'invalid_union', 'custom', 'nonsense',
  ])('%s 도 열쇠를 돌려준다', (code) => {
    expect(messageKeyForIssue({ code })).toMatch(/^valid\.[A-Za-z]+$/);
  });
});
