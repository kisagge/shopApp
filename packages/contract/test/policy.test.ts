import { describe, it, expect } from 'vitest';
import { policySchema } from '../src';

/**
 * 약관·개인정보처리방침 저장 계약.
 *
 * **본문이 비면 받지 않는다.** 편집기는 아직 한 번도 안 쓴 방침을 **빈 문서**로 열어
 * 주므로, 처음 쓰러 온 사람이 가장 먼저 만나는 거절이 이것이다. 그 `.refine()` 이 한 번도
 * 안 돌았다 — 빈 나무도 "나무 하나" 라서 모양만 보는 검사는 통과시킨다.
 */

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

const base = { title: '이용약관', effectiveOn: '2026-12-01' };

describe('방침 본문', () => {
  it('글이 있으면 받는다', () => {
    expect(policySchema.safeParse({ ...base, bodyRich: doc(paragraph('제1조 목적')) }).success).toBe(true);
  });

  it.each([
    ['내용이 없는 나무', doc()],
    ['빈 문단 하나', doc(paragraph(''))],
    ['공백만 적은 문단', doc(paragraph('   '))],
  ])('%s 는 받지 않는다', (_label, bodyRich) => {
    const r = policySchema.safeParse({ ...base, bodyRich });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.bodyRequired');
  });

  /** 시행일을 받는 까닭은 "며칠 뒤부터 이렇게 바뀝니다" 를 적을 수 있어야 하기 때문이다 */
  it('시행일은 날짜 단위로 받는다 — 시각까지 받지 않는다', () => {
    const body = doc(paragraph('제1조 목적'));
    expect(policySchema.safeParse({ ...base, bodyRich: body }).success).toBe(true);
    expect(policySchema.safeParse({ ...base, bodyRich: body, effectiveOn: '2026-12-01T00:00:00Z' }).success).toBe(false);
  });
});
