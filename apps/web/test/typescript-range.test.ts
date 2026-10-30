import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **타입스크립트는 lint 가 받아 주는 판까지만 올린다.**
 *
 * 6 → 7 을 올려 봤다. 설치도 되고 `tsc 7.0.2` 도 통과하는데 **`typescript-eslint` 가 불러오는 순간
 * 던진다**: "typescript-eslint does not support TS 7.0". 짝 범위 경고가 아니라 가드이고, 그쪽이
 * 준비 중인 것은 **7.1 이상**이라 7.0 은 아예 대상이 아니다(그쪽 issue 10940).
 *
 * 이 저장소는 그 규칙에 깊이 기대고 있다 — `recommendedTypeChecked` + `projectService` 로 타입 기반
 * 규칙을 켜 두었고, 그것이 실제로 일한다(next 16.4 가 `import.meta.glob` 타입을 넣자 군더더기가 된
 * 단정을 잡았고, 객체를 글자로 만드는 자리도 잡았다). lint 를 끄고 컴파일러만 올리는 것은 맞바꿀
 * 거래가 아니다.
 *
 * **그래서 글로만 적어 두지 않는다.** `pnpm outdated` 는 7.0.2 를 권하고, 그 권유를 받아 올리면
 * lint 가 통째로 죽는다 — 까닭을 모르면 같은 실험을 다시 하게 된다(내가 그랬다). 여기서 막고,
 * **그쪽이 범위를 넓히는 날 저절로 풀린다**(범위를 읽어 견주므로 이 검사를 고칠 일이 없다).
 */

const ROOT = join(process.cwd(), '..', '..');

/** 워크스페이스 전체에서 선언한 typescript 판들 */
function declaredTypescript(): { dir: string; version: string }[] {
  const out: { dir: string; version: string }[] = [];
  const dirs = ['.', ...['apps', 'packages'].flatMap((base) =>
    readdirSync(join(ROOT, base), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => `${base}/${e.name}`),
  )];

  for (const dir of dirs) {
    let raw: string;
    try {
      raw = readFileSync(join(ROOT, dir, 'package.json'), 'utf8');
    } catch {
      continue;
    }
    const manifest = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const version = manifest.devDependencies?.['typescript'] ?? manifest.dependencies?.['typescript'];
    if (version) out.push({ dir, version });
  }
  return out;
}

/** `typescript-eslint` 가 받는 typescript 범위 — 설치된 것에서 읽는다 */
function eslintPeerRange(): string {
  const raw = readFileSync(
    join(ROOT, 'packages/config/node_modules/typescript-eslint/package.json'),
    'utf8',
  );
  const manifest = JSON.parse(raw) as { peerDependencies?: Record<string, string> };
  const range = manifest.peerDependencies?.['typescript'];
  expect(range, 'typescript-eslint 의 typescript 짝 범위를 못 찾았다').toBeTruthy();
  return range!;
}

const tuple = (v: string): number[] => v.split('.').map((n) => Number.parseInt(n, 10));

/** a < b */
const lt = (a: number[], b: number[]): boolean => {
  for (let i = 0; i < 3; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
};

describe('선언한 타입스크립트', () => {
  it('워크스페이스 전체가 한 판을 쓴다', () => {
    /*
     * 꾸러미마다 다른 판을 쓰면 **어느 판이 돌고 있는지 아무도 모른다** — 타입은 한 판으로 둔다.
     * 올릴 때 한 자리를 잊는 실수가 여기서 걸린다.
     */
    const declared = declaredTypescript();
    expect(declared.length, 'typescript 를 선언한 꾸러미를 못 찾았다').toBeGreaterThan(5);
    expect([...new Set(declared.map((d) => d.version))]).toHaveLength(1);
  });

  it('lint 가 받아 주는 범위 안이다', () => {
    const range = eslintPeerRange();
    const declared = declaredTypescript();
    const version = declared[0]!.version;

    /*
     * 범위는 `>=4.8.4 <6.1.0` 모양이다. 모양이 바뀌면 **읽는 법을 고치라고** 여기서 진다 —
     * 못 읽은 채로 통과시키면 이 검사가 헛돈다.
     */
    const bounds = /^>=\s*([\d.]+)\s+<\s*([\d.]+)$/.exec(range);
    expect(
      bounds,
      `typescript-eslint 의 짝 범위 모양이 바뀌었다("${range}") — 이 검사의 읽는 법을 함께 고친다`,
    ).not.toBeNull();

    const [, min, max] = bounds!;
    expect(
      lt(tuple(version), tuple(min!)),
      `선언한 ${version} 이 lint 가 받는 최소 ${min} 보다 낮다`,
    ).toBe(false);
    expect(
      lt(tuple(version), tuple(max!)),
      `선언한 ${version} 은 typescript-eslint(${range})가 받지 않는다. ` +
        'lint 가 불러오는 순간 던진다 — 그쪽이 범위를 넓힌 판이 나온 뒤에 함께 올린다',
    ).toBe(true);
  });
});
