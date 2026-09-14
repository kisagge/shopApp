import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 어두운 테마가 **두 곳에 적혀 있다.**
 *
 * CSS 에는 변수를 한 번 적고 두 선택자에 붙이는 방법이 없다. 그래서
 * 어두운 값 묶음이 두 벌 있다.
 *
 * - `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])`
 *   — 기기 설정을 따라갈 때
 * - `:root[data-theme="dark"]` — 사람이 직접 어둡게 고를 때
 *
 * **한쪽만 고치면 아무도 모른다.** 고친 사람은 자기 기기에서 확인하는데,
 * 그 기기의 OS 설정이 어느 쪽인지에 따라 둘 중 한 벌만 보이기 때문이다.
 * 대비 검사들도 각자 한 벌만 밟는다. 여기서 둘을 맞대 본다.
 */

const CSS = readFileSync(join(import.meta.dirname, '..', 'src/styles/theme.css'), 'utf8');

/**
 * 여는 선택자부터 짝이 맞는 닫는 중괄호까지.
 *
 * 같은 선택자가 파일에 여러 번 나온다(`:root` 는 `@theme` 안에도 있다).
 * `contains` 로 원하는 블록을 집는다 — 줄 수나 순서에 기대지 않는다.
 */
function block(opener: string, contains = ''): string {
  let start = -1;
  for (let at = CSS.indexOf(opener); at !== -1; at = CSS.indexOf(opener, at + 1)) {
    if (CSS.slice(at, CSS.indexOf('}', at) + 1).includes(contains)) { start = at; break; }
    if (!contains) { start = at; break; }
  }
  expect(start, `선택자를 못 찾았다: ${opener}`).toBeGreaterThan(-1);

  let depth = 0;
  for (let i = start + opener.length - 1; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(start, i);
    }
  }
  throw new Error(`중괄호가 안 닫혔다: ${opener}`);
}

/** `--이름: 값;` 을 이름→값 으로. 주석과 들여쓰기는 버린다. */
function declarations(source: string): Record<string, string> {
  const body = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map(([, name, value]) => [
      name!,
      value!.trim().replace(/\s+/g, ' '),
    ]),
  );
}

describe('어두운 테마 두 벌', () => {
  const followsDevice = declarations(block(':root:not([data-theme="light"]) {'));
  const chosen = declarations(block(':root[data-theme="dark"] {'));

  it('두 벌을 실제로 읽어 냈다 — 못 읽으면 아래가 헛돈다', () => {
    // 빈 것끼리는 언제나 같다. 눈을 감고 통과하는 자리를 먼저 막는다.
    expect(Object.keys(followsDevice).length).toBeGreaterThan(15);
    expect(followsDevice['--bg']).toBe('var(--color-dark-bg)');
  });

  it('같은 토큰을 같은 값으로 적는다', () => {
    expect(chosen).toEqual(followsDevice);
  });

  it('둘 다 브라우저가 그리는 것까지 어둡게 한다', () => {
    /*
     * 스크롤바·기본 폼 위젯·자동완성 배경은 우리가 칠하는 것이 아니다.
     * 이 값을 안 주면 브라우저는 무조건 밝게 그린다 — 어두운 화면에
     * **흰 스크롤바**가 붙어 있었다.
     */
    expect(followsDevice['color-scheme']).toBe('dark');
    expect(chosen['color-scheme']).toBe('dark');
    // 밝은 역할 토큰 블록. 파일 맨 위의 `@theme` 안 :root 와 구별해 집는다.
    expect(declarations(block(':root {', '--color-n-0'))['color-scheme']).toBe('light');
  });
});

describe('문서 끝의 러버밴드', () => {
  it('html 과 body 가 끝에서 더 당겨지지 않는다', () => {
    /*
     * 맨 위에서 한 번 더 당기면 머리 위에 빈 띠가 드러났다. 이 줄이 빠지면 눈으로만 알 수
     * 있고, 그것도 트랙패드나 휴대폰에서 끝까지 당겨 봐야 보인다.
     */
    const rule = (selector: string) => {
      const at = CSS.search(new RegExp(`\\n\\s*${selector} \\{`));
      expect(at, `${selector} 규칙을 못 찾았다`).toBeGreaterThan(-1);
      return CSS.slice(at, CSS.indexOf('}', at));
    };
    expect(rule('html')).toContain('overscroll-behavior-y: none');
    expect(rule('body')).toContain('overscroll-behavior-y: none');
  });
});
