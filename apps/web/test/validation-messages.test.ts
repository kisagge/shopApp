import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createTranslator, messageKeys, LOCALES } from '@shop/i18n';

/**
 * 계약의 검증 문구가 실제로 있는 사전 열쇠인지 지킨다.
 *
 * 계약(@shop/contract)은 문장이 아니라 열쇠(`valid.*`)를 담고, 응답을 만드는
 * 서버가 그것을 요청의 언어로 바꾼다. **열쇠를 잘못 적어도 아무 곳도 터지지
 * 않는다** — 번역이 그냥 통과되어 사용자에게 `valid.tooLongChras` 같은 글자가
 * 그대로 보인다. 조용한 실수라 검사로 막는다.
 */

const SRC = join(process.cwd(), '..', '..', 'packages', 'contract', 'src');

/** 소스에서 검증 문구로 쓰인 문자열을 뽑는다 */
function messagesIn(source: string): string[] {
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  return [...stripped.matchAll(/'(valid\.[A-Za-z]+)'/g)].map((m) => m[1]!);
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.ts'));

describe('계약의 검증 문구', () => {
  const known = new Set<string>(messageKeys());

  const used = new Set<string>();
  for (const file of files) {
    for (const key of messagesIn(readFileSync(join(SRC, file), 'utf8'))) used.add(key);
  }

  it('쓰이는 열쇠가 있다 — 정규식이 헛돌지 않는다', () => {
    expect(used.size).toBeGreaterThan(30);
  });

  it('모두 사전에 있다', () => {
    expect([...used].filter((k) => !known.has(k)).sort()).toEqual([]);
  });

  it('세 언어 모두 빈 문구가 아니다', () => {
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      for (const key of used) {
        expect(t(key as never).trim(), `${locale}/${key}`).not.toBe('');
      }
    }
  });

  it('계약에 한국어 검증 문구가 남아 있지 않다', () => {
    /*
     * Zod 문구만 본다. 계약에는 업무 오류 상수(ORDER_ERROR 같은 것)도 있고
     * 그쪽은 아직 한국어다 — 그건 이 검사의 몫이 아니다.
     */
    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(SRC, file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      for (const m of source.matchAll(
        /\.(?:min|max|regex|email|int|nonnegative|length|refine|superRefine)\([^)]*?(['"`])([^'"`]*[가-힣][^'"`]*)\1/g,
      )) {
        offenders.push(`${file}: ${m[2]}`);
      }
      for (const m of source.matchAll(/message:\s*(['"`])([^'"`]*[가-힣][^'"`]*)\1/g)) {
        offenders.push(`${file}: ${m[2]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
