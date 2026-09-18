import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 훑기가 화면을 빠뜨리지 않게 지킨다.
 *
 * **목록을 손으로 적었더니 열 장을 놓쳤다.** 그중에 결제 화면이 있었다 —
 * 주소를 넣고 결제 수단을 고르는, 이 앱에서 이름표가 가장 많이 붙는 자리다.
 * 놓친 줄도 몰랐다: 훑기는 서른아홉 장을 통과했다고 말하고 있었으니까.
 *
 * 그래서 목록을 **파일에서 만든다.** 새 화면을 더하면 훑기에 넣거나, 왜
 * 넣지 않는지 여기 적어야 한다. 둘 다 안 하면 진다.
 *
 * **동적 경로는 보지 않는다.** `/product/[slug]` 같은 것은 주소를 지어낼 수
 * 없어서 훑기가 "목록에서 하나 골라 들어간다" 로 덮고, 그건 이름으로 적힌
 * 검사라 파일 이름과 맞춰 볼 수가 없다. 놓쳤던 열 장은 전부 정적 경로였다.
 */

const APP = join(process.cwd(), 'src', 'app');
const E2E = join(process.cwd(), 'e2e');

/** 훑지 않는 화면과 그 이유. 이유 없이 빼지 못한다. */
const EXCLUDED: Readonly<Record<string, string>> = {
  '/checkout/success':
    '토스가 돌아오는 자리다. 열쇠 없이 열면 항상 /checkout/fail 로 넘기고, 그쪽은 훑는다.',
  '/merchant/suspended':
    '정지된 가맹점의 세션이 아니면 열리지 않는다(다른 사람은 첫 화면으로 보낸다). merchant-suspended 가 그 세션으로 훑는다.',
};

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // (group) 폴더는 주소에 안 들어간다
      const segment = name.startsWith('(') ? '' : `/${name}`;
      return routes(full, prefix + segment);
    }
    return name === 'page.tsx' ? [prefix || '/'] : [];
  });
}

const swept = (): Set<string> => {
  const files = readdirSync(E2E).filter((f) => f.startsWith('a11y-') && f.endsWith('.spec.ts'));
  const source = files.map((f) => readFileSync(join(E2E, f), 'utf8')).join('\n');
  const found = new Set<string>();
  for (const m of source.matchAll(/'(\/[^']*)'/g)) found.add(m[1]!.split('?')[0]!);
  return found;
};

describe('접근성 훑기의 범위', () => {
  it('정적 경로는 훑거나, 왜 안 훑는지 적혀 있다', () => {
    const covered = swept();
    const missing = routes(APP)
      .filter((r) => !r.includes('['))
      .filter((r) => !covered.has(r) && !(r in EXCLUDED));

    expect(missing).toEqual([]);
  });

  it('빼 둔 화면은 실제로 있는 화면이다 — 목록만 남고 화면이 사라지면 안 된다', () => {
    const all = new Set(routes(APP));
    expect(Object.keys(EXCLUDED).filter((r) => !all.has(r))).toEqual([]);
  });

  it('검사가 헛돌지 않는다 — 화면을 실제로 찾았다', () => {
    expect(routes(APP).length).toBeGreaterThan(40);
  });
});
