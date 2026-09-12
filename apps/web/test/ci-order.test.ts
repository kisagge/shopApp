import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * CI 의 단계 순서를 지킨다 — **빌드가 검사보다 먼저**.
 *
 * `client-dictionary` 검사는 소스가 아니라 빌드 결과(`.next/static/chunks`)를
 * 본다. 소스로 갈라 놓아도 Turbopack 이 한 청크로 합치면 사전 세 벌이 함께
 * 나가는데, 그건 청크를 열어 봐야만 보인다. 그래서 그 검사는 빌드가 없으면
 * `it.runIf(built)` 로 스스로 물러난다.
 *
 * **그 물러남이 내내 일어나고 있었다.** ci-local.sh 는 시작할 때 `.next` 를
 * 지우고, 두 CI 모두 `test` 를 `build` 보다 먼저 돌렸다. 그래서 사전이 번들에
 * 들어갔는지 보는 검사는 **한 번도 CI 에서 돈 적이 없다** — 있는데 안 도는
 * 검사는 없는 검사보다 나쁘다. 있다고 믿게 만들기 때문이다.
 *
 * 순서를 되돌리면 여기서 진다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/**
 * ci-local.sh 가 도는 단계들.
 *
 * **문지기가 둘이 되면서 목록도 둘이다.** 빠른 쪽(`ci:quick`)은 e2e 를 빼고
 * 돌리는데, 두 목록이 따로 놀면 어느 날 한쪽에만 단계가 붙는다.
 */
function stepLists(sh: string): { full: string[]; quick: string[] } {
  const lists = [...sh.matchAll(/^\s*STEPS="([a-z0-9 ]+)"/gm)].map((m) =>
    m[1]!.trim().split(/\s+/),
  );
  expect(lists.length, 'ci-local.sh 에서 단계 목록을 못 찾았다').toBe(2);
  const [full, quick] = lists as [string[], string[]];
  return { full, quick };
}

/** 단계 이름이 나오는 차례 — 없으면 -1 */
function order(source: string, steps: readonly string[]): number[] {
  return steps.map((s) => source.indexOf(s));
}

describe('CI 단계 순서', () => {
  it('ci-local.sh 가 검사보다 빌드를 먼저 돌린다', () => {
    const sh = readFileSync(join(ROOT, 'tooling/ci-local.sh'), 'utf8');
    const { full, quick } = stepLists(sh);

    for (const steps of [full, quick]) {
      expect(steps).toContain('build');
      expect(steps).toContain('test');
      expect(
        steps.indexOf('build'),
        `단계가 ${steps.join(' ')} 순이다 — build 가 test 보다 뒤면 사전 검사가 건너뛴다`,
      ).toBeLessThan(steps.indexOf('test'));
    }
  });

  it('빠른 문지기는 전체의 앞부분이다', () => {
    /*
     * **둘이 다른 것을 보면 안 된다.** 빠른 쪽은 뒤를 잘라 낸 것일 뿐이어야
     * 한다 — 순서가 갈라지거나 한쪽에만 단계가 붙으면, 빠른 쪽을 통과한 것이
     * 전체에서 무엇을 뜻하는지 아무도 모르게 된다.
     */
    const sh = readFileSync(join(ROOT, 'tooling/ci-local.sh'), 'utf8');
    const { full, quick } = stepLists(sh);

    expect(quick.length, '빠른 쪽이 전체보다 많다').toBeLessThan(full.length);
    expect(full.slice(0, quick.length), '빠른 쪽이 전체의 앞부분이 아니다').toEqual(quick);
    // 잘라 낸 것이 e2e 라는 사실도 못 박는다 — 그것이 나눈 이유다
    expect(full.slice(quick.length)).toEqual(['e2e']);
  });

  it('ci.yml 이 검사보다 빌드를 먼저 돌린다', () => {
    const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const build = yml.indexOf('run: pnpm turbo run build');
    const test = yml.indexOf('run: pnpm turbo run test');

    expect(build, 'ci.yml 에서 빌드 단계를 못 찾았다').toBeGreaterThan(-1);
    expect(test, 'ci.yml 에서 테스트 단계를 못 찾았다').toBeGreaterThan(-1);
    expect(build, 'ci.yml 에서 test 가 build 보다 앞이다').toBeLessThan(test);
  });

  it('두 CI 가 같은 단계를 같은 차례로 돌린다', () => {
    const sh = readFileSync(join(ROOT, 'tooling/ci-local.sh'), 'utf8');
    const yml = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
    const steps = stepLists(sh).full;

    // ci-local.sh 가 "CI 와 같은 순서" 라고 적어 둔 약속을 실제로 지키는지
    const inYml = order(
      yml,
      steps.map((s) => `run: pnpm turbo run ${s}`),
    );
    expect(inYml.filter((i) => i === -1), `ci.yml 에 없는 단계가 있다: ${steps.join(' ')}`).toEqual([]);
    expect([...inYml].sort((a, b) => a - b), `ci.yml 의 차례가 ${steps.join(' ')} 와 다르다`).toEqual(
      inYml,
    );
  });
});
