import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import * as contract from '@shop/contract';
import { LOCALES } from '@shop/i18n';
import { createTranslator, messageKeys } from '@shop/i18n/all';
import { translateIssue, type IssueBounds } from '~/lib/i18n/issue';

/**
 * **어떤 값을 넣어도 영어가 새지 않는다.**
 *
 * 세 층으로 막아 놨다 — 계약의 제약마다 열쇠를 붙이고, 그 열쇠가 사전에
 * 있는지 보고, 열쇠에 숫자가 채워지는지 본다. 그래도 **열쇠를 붙일 자리가
 * 없는 실패**가 남는다: 칸을 아예 안 보냈거나, 문자열 자리에 숫자를
 * 보냈거나, 고를 수 없는 값을 골랐을 때. 그건 검사가 아니라 타입 자체의
 * 실패라 `.max(30, '...')` 처럼 문구를 달 곳이 없었고, Zod 의 기본 문구가
 * 그대로 나갔다 — `Invalid input: expected string, received number`.
 *
 * 그래서 전역 바닥(`@shop/contract` 의 errors.ts)을 깔았다. 이 검사는 그
 * 바닥이 **실제로 모든 구멍을 막는지**를, 스키마마다 쓰레기를 넣어서 본다.
 * 갈래를 하나씩 짚는 대신 전부에 던지는 이유는, 짚어 둔 목록은 새 스키마가
 * 생기면 낡기 때문이다.
 */

/** 스키마가 무엇이든 하나쯤은 걸리게 하는 값들 */
const JUNK: readonly unknown[] = [
  undefined, null, {}, [], 0, -1, 1.5, '', 'x', 'x'.repeat(5_000), true,
  { a: 1 }, [1, 2, 3],
  { code: 1, name: 1, lines: 1, items: 1, reason: 1, quantity: 'many' },
];

/**
 * 계약이 내보내는 것 중 **파싱할 수 있는 것**만 고른다. 열쇠를 돌려주는
 * 함수처럼 스키마가 아닌 것도 함께 나오기 때문이다.
 */
const schemas: ReadonlyArray<readonly [string, z.ZodType]> = Object.entries(contract).flatMap(
  ([name, value]) =>
    typeof (value as { safeParse?: unknown } | null)?.safeParse === 'function'
      ? [[name, value as z.ZodType] as const]
      : [],
);

/** 이 스키마에 쓰레기를 넣었을 때 나오는 모든 문구 */
function messagesFrom(schema: z.ZodType): readonly { message: string; issue: IssueBounds }[] {
  const out: { message: string; issue: IssueBounds }[] = [];
  for (const input of JUNK) {
    const parsed = schema.safeParse(input);
    if (parsed.success) continue;
    for (const issue of parsed.error.issues) {
      out.push({ message: issue.message, issue: issue as IssueBounds });
    }
  }
  return out;
}

describe('검증 문구', () => {
  const known = new Set<string>(messageKeys());

  it('스키마를 실제로 훑고 있다 — 빈 목록이면 아래가 전부 헛돈다', () => {
    expect(schemas.length).toBeGreaterThan(40);
    expect(schemas.flatMap(([, s]) => messagesFrom(s)).length).toBeGreaterThan(100);
  });

  it.each(schemas)('%s — 나오는 문구가 전부 사전 열쇠다', (_name, schema) => {
    const strays = [...new Set(messagesFrom(schema).map((m) => m.message))].filter(
      (m) => !known.has(m),
    );

    expect(
      strays,
      '사전에 없는 문구는 번역되지 않고 그대로 화면에 나간다.\n' +
        '제약이면 열쇠를 붙이고, 타입 실패면 errors.ts 의 바닥을 넓힌다.',
    ).toEqual([]);
  });

  it.each(schemas)('%s — 번역하면 세 언어 모두 사람의 말이 된다', (_name, schema) => {
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      for (const { message, issue } of messagesFrom(schema)) {
        const text = translateIssue(t, message, issue);
        expect(text.trim(), `${locale}/${message}`).not.toBe('');
        expect(text, `${locale}/${message} — 열쇠가 그대로 나간다`).not.toMatch(/^valid\./);
        expect(text, `${locale}/${message} — 자리표시자가 남았다`).not.toMatch(/\{\w+\}/);
      }
    }
  });
});
