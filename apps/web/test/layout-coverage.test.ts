import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 자리 훑기가 화면을 빠뜨리지 않게 지킨다.
 *
 * 접근성 훑기를 만들 때 목록을 손으로 적었다가 **열 장을 놓쳤고 그중에 결제
 * 화면이 있었다.** 그래서 그쪽은 파일 시스템에서 목록을 만들게 바꿨는데,
 * 자리 훑기를 새로 만들면서 **같은 실수를 다시 했다** — 손님 화면 열한 장만
 * 적어 두고 운영 화면 열여섯 장을 통째로 빠뜨렸다. 뒤늦게 넣어 보니 거기서
 * 결함이 셋 나왔다.
 *
 * 접근성 쪽과 같은 자리다. 새 화면을 더하면 훑기에 넣거나, 왜 넣지 않는지
 * 여기 적어야 한다.
 */

const WEB = resolve(import.meta.dirname, '..');
const APP = join(WEB, 'src/app');
const E2E = join(WEB, 'e2e');

/** 훑지 않는 화면과 그 이유. 이유 없이 빼지 못한다. */
const EXCLUDED: Readonly<Record<string, string>> = {
  '/checkout/success':
    '토스가 돌아오는 자리다. 열쇠 없이 열면 늘 /checkout/fail 로 넘기고, 그쪽은 훑는다.',
  '/offline':
    '서비스워커가 네트워크가 끊겼을 때만 꺼내는 화면이라 주소로 열어도 그 상태가 아니다.',
  '/account/closed': '탈퇴 직후에만 뜻이 있는 안내 한 장이다. 상자에 담긴 글자가 없다.',
  '/admin/products/[id]': '동적 경로는 주소를 지어낼 수 없다. 목록(/admin/products)이 같은 표를 쓴다.',
};

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = name.startsWith('(') ? '' : `/${name}`;
      return routes(full, prefix + segment);
    }
    return name === 'page.tsx' ? [prefix || '/'] : [];
  });
}

/** 자리 훑기가 실제로 여는 주소들 */
const swept = (): ReadonlySet<string> => {
  const files = readdirSync(E2E).filter((f) => f.startsWith('layout') && f.endsWith('.spec.ts'));
  const source = files.map((f) => readFileSync(join(E2E, f), 'utf8')).join('\n');
  const found = new Set<string>();
  for (const m of source.matchAll(/'(\/[^']*)'/g)) found.add(m[1]!.split('?')[0]!);
  return found;
};

describe('자리 훑기의 범위', () => {
  const all = routes(APP);

  it('화면을 실제로 찾는다 — 빈 목록이면 아래가 헛돈다', () => {
    expect(all.length).toBeGreaterThan(30);
    expect(swept().size).toBeGreaterThan(20);
  });

  /** 동적 경로는 주소를 지어낼 수 없다. 접근성 훑기와 같은 이유로 뺀다. */
  it('정적 경로는 훑거나, 왜 안 훑는지 적혀 있다', () => {
    const covered = swept();
    const missing = all
      .filter((r) => !r.includes('['))
      .filter((r) => !covered.has(r) && !(r in EXCLUDED));

    expect(
      missing,
      '이 화면들의 자리를 아무도 재지 않는다.\n' +
        'e2e/layout*.spec.ts 에 넣거나, 왜 안 재는지 EXCLUDED 에 이유와 함께 적는다.',
    ).toEqual([]);
  });

  it('빼 둔 화면이 전부 실제로 있다 — 목록만 남고 화면이 사라지면 안 된다', () => {
    const known = new Set(all);
    expect(Object.keys(EXCLUDED).filter((r) => !known.has(r))).toEqual([]);
  });

  it('빼 둔 이유가 이름만 적힌 것이 아니다', () => {
    expect(Object.entries(EXCLUDED).filter(([, why]) => why.trim().length < 20)).toEqual([]);
  });
});
