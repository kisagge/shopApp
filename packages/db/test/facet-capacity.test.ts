import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { MAX_FACET_VALUES } from '@shop/core';

/**
 * 매대가 내놓는 값보다 상한이 낮으면, 칩을 전부 누른 사람이 진다.
 *
 * 상한이 10 이던 시절 상품이 서른넷이 되면서 검색 화면 한 곳에 사이즈 칩이
 * 열둘 떴다. 그걸 전부 누르면 계약이 넘친다며 고른 것을 통째로 버렸고,
 * 화면은 조건 없는 목록과 빈 체크박스로 돌아왔다.
 *
 * **목록을 손으로 적지 않는다.** 시드 파일을 읽어 값 종류를 직접 센다.
 * 상품을 더 넣다가 매대가 상한을 넘기면 그 순간 이 검사가 진다 — 사용자가
 * 먼저 만나기 전에.
 */
const SEED = readFileSync(fileURLToPath(new URL('../src/seed.ts', import.meta.url)), 'utf8');

/** `colors: [{ value: '오트밀', hex: … }, …]` 에서 값만 뽑는다 */
function seededColors(): Set<string> {
  const out = new Set<string>();
  for (const block of SEED.matchAll(/colors:\s*\[([\s\S]*?)\]/g)) {
    for (const m of block[1]!.matchAll(/value:\s*'([^']+)'/g)) out.add(m[1]!);
  }
  return out;
}

/** `sizes: ['S', 'M', …]` */
function seededSizes(): Set<string> {
  const out = new Set<string>();
  for (const block of SEED.matchAll(/sizes:\s*\[([^\]]*)\]/g)) {
    for (const m of block[1]!.matchAll(/'([^']+)'/g)) out.add(m[1]!);
  }
  return out;
}

describe('좁혀 보기 상한은 매대보다 넓다', () => {
  it('시드에서 값을 실제로 읽어 온다 — 못 읽으면 이 검사는 아무것도 지키지 못한다', () => {
    // 정규식이 헛돌면 빈 집합이 되고, 그러면 아래 검사가 늘 통과한다.
    expect(seededColors().size).toBeGreaterThan(5);
    expect(seededSizes().size).toBeGreaterThan(5);
  });

  it('색상 종류가 상한 안에 든다', () => {
    expect(seededColors().size).toBeLessThanOrEqual(MAX_FACET_VALUES);
  });

  it('사이즈 종류가 상한 안에 든다', () => {
    expect(seededSizes().size).toBeLessThanOrEqual(MAX_FACET_VALUES);
  });
});
