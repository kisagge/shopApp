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

/**
 * 정리가 판정을 뒤집지 않는다.
 *
 * **전부 통과한 판이 exit 1 로 끝났다.** 트랩의 마지막 명령이 실패하면 그것이 스크립트의 끝 상태가
 * 되는데, 방금 세운 `next start` 가 내려가는 중이면 빌드 폴더를 지우다 "Directory not empty" 가 난다.
 * 그 숫자를 보고 다음 사람은 멀쩡한 코드를 뒤진다 — 실제로 한 판을 그렇게 썼다.
 */
describe('문지기의 끝 상태', () => {
  const sh = () => readFileSync(join(ROOT, 'tooling/ci-local.sh'), 'utf8');

  it('정리는 들어올 때의 상태를 그대로 내보낸다', () => {
    const source = sh();
    const cleanup = /cleanup\(\) \{(.*?)\n\}/s.exec(source)?.[1];
    expect(cleanup, 'ci-local.sh 에서 cleanup 을 못 찾았다').toBeTruthy();

    expect(cleanup, '들어올 때의 상태를 쥐지 않는다').toMatch(/status=\$\?/);
    expect(cleanup!.trimEnd().endsWith('exit "$status"'), '마지막에 그 상태로 끝내지 않는다').toBe(true);
  });

  it('치우다 걸려도 넘어간다 — 서버가 내려가는 중이면 폴더에 손이 닿아 있다', () => {
    expect(sh()).toMatch(/rm -rf "apps\/web\/\$NEXT_DIST_DIR" 2>\/dev\/null \|\| true/);
  });

  /** 개발 서버의 `.next` 와 다투지 않으려고 자기 폴더에서 빌드한다 */
  it('문지기는 자기 빌드 폴더를 쓴다', () => {
    expect(sh()).toMatch(/export NEXT_DIST_DIR=/);
  });
});

/**
 * **재시도는 켜되, 재시도로 통과한 판은 초록이 아니다.**
 *
 * 로컬 문지기만 재시도가 0 이면 "CI 와 같은 조건" 이 거짓말이 되고, 한 번 흔들린 판이 그대로 빨갛게
 * 끝나 멀쩡한 코드를 뒤지게 된다 — 실제로 두 판을 그렇게 썼다. 그렇다고 넘어가면 더 나쁘다: 여기서
 * 초록은 "커밋해도 된다" 는 뜻이고 이 저장소는 푸시가 곧 배포라, 운에 기댄 판을 통과로 치면 가리개를
 * 켜 둔 채 배포하는 셈이 된다.
 *
 * **이 둘은 함께 있어야 한다.** 재시도만 켜고 알리지 않으면 "N flaky" 가 수백 줄 로그의 가운데를
 * 지나가고 아무도 못 본다 — 그게 재시도의 가장 흔한 실패 모양이다.
 */
describe('재시도와 그 값', () => {
  const sh = () => readFileSync(join(ROOT, 'tooling/ci-local.sh'), 'utf8');
  const config = () => readFileSync(join(ROOT, 'apps/web/playwright.config.ts'), 'utf8');

  it('문지기임을 알린다 — 재시도와 `.only` 막기가 그 깃발로 켜진다', () => {
    expect(sh(), 'ci-local.sh 가 문지기 깃발을 세우지 않는다').toMatch(/export GATE=1/);

    const source = config();
    expect(source, 'playwright.config 이 그 깃발을 읽지 않는다').toMatch(/process\.env\['GATE'\]/);
    // 깃발 하나로 묶는다 — 따로 두면 어느 날 한쪽만 켜진 채 돈다
    expect(source, '재시도가 그 깃발을 따르지 않는다').toMatch(/retries:\s*GATE/);
    expect(source, '`.only` 막기가 그 깃발을 따르지 않는다').toMatch(/forbidOnly:\s*GATE/);
  });

  /**
   * **`.only` 는 단위 검사에도 있다.** vitest 는 CI 깃발로 그것을 막는다(allowOnly 의 기본값) —
   * 그 한 단계만 CI 와 같은 깃발로 돌린다. 전체에 걸면 Playwright 의 워커 수·리포터까지 CI 모양이
   * 되어 로컬 게이트가 크게 느려진다.
   */
  it('단위 검사 단계는 CI 깃발로 돈다', () => {
    expect(sh()).toMatch(/CI=1 pnpm turbo run test/);
  });

  /**
   * **잠금 파일 어긋남은 배포에서만 드러난다.** 여기는 이미 깔린 node_modules 로 도는데, CI 와
   * Vercel 은 처음부터 깐다 — 이 저장소는 푸시가 곧 배포라 그 자리가 "배포가 깨졌다" 가 된다.
   */
  it('잠금 파일이 package.json 과 맞는지 먼저 본다', () => {
    expect(sh()).toMatch(/pnpm install --frozen-lockfile/);
  });

  /** "같은 조건" 이라고만 하면 여기 초록을 CI 초록으로 읽는다 — 못 보는 것을 끝에 적는다 */
  it('못 보는 것을 끝에 말한다', () => {
    const tail = sh().slice(sh().indexOf('전부 통과했습니다'));
    expect(tail, '차이를 말하지 않는다').toMatch(/못 보는 것/);
  });

  it('켰으면 재시도로 통과한 것을 세어 이름을 알린다', () => {
    const source = sh();
    expect(source, 'e2e 출력을 남기지 않는다 — 남기지 않으면 셀 수가 없다').toMatch(/tee "\$E2E_LOG"/);
    expect(source, '재시도로 통과한 것을 찾지 않는다').toMatch(/flaky/);
  });

  /** 통과로 치면 다음 사람은 그 가리개를 켜 둔 채 커밋한다 */
  it('재시도로 통과한 판은 0 으로 끝내지 않는다', () => {
    const source = sh();
    const tail = source.slice(source.indexOf('FLAKY='));
    expect(tail, '재시도로 통과한 판에서 1 로 끝내지 않는다').toMatch(/\[ -n "\$FLAKY" \][\s\S]*exit 1/);
  });
});
