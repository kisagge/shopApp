import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 아무도 부르지 않는 값과 함수를 찾는다.
 *
 * **죽은 값은 그냥 군더더기가 아니다.** 이 저장소에서 두 번 다른 것을 가리켰다.
 * 한 번은 라우트도 화면도 없이 완성돼 있던 쿠폰 지급이었고, 한 번은 주석이
 * "어드민 화면이 쓴다" 고 적어 둔 별칭이었다 — 부르는 곳이 없었다.
 * 뒤쪽이 더 나쁘다. **읽는 사람을 속인다.**
 *
 * 그리고 이 검사를 손으로 하다 실수했다. `apps/web/scripts` 를 훑는 자리에
 * 넣지 않아서, 백필 스크립트가 쓰고 있는 함수를 죽었다고 지웠다. 타입 검사가
 * 잡았다. 그래서 **찾는 자리를 여기 못 박는다** — 훑는 범위가 곧 이 검사의
 * 정확도다.
 */

const ROOT = join(__dirname, '..', '..', '..');

/** 쓰는 쪽으로 세는 자리. 하나라도 빠지면 멀쩡한 것을 죽었다고 한다. */
const SEARCHED = [
  'apps/web/src',
  'apps/web/scripts',
  'apps/web/test',
  'apps/web/e2e',
  'apps/mobile/www',
  'packages',
  'tooling',
];

/** 내보내는 쪽. 이 안에서만 죽은 것을 찾는다. */
const DECLARED = ['apps/web/src', 'packages'];

function walk(dir: string): string[] {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'generated' || name === '.next') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out = out.concat(walk(full));
    else if (/\.(ts|tsx|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const files = (roots: readonly string[]) =>
  roots.flatMap((r) => {
    try {
      return walk(join(ROOT, r));
    } catch {
      return [];
    }
  });

/**
 * 프레임워크가 부르는 이름들.
 *
 * 우리 코드가 안 부른다고 죽은 것이 아니다 — Next 가 규약으로 찾아 쓴다.
 */
const FRAMEWORK = new Set([
  'generateStaticParams',
  'generateMetadata',
  'generateViewport',
  'metadata',
  'viewport',
  'dynamic',
  'revalidate',
  'runtime',
  'preferredRegion',
  'maxDuration',
  'fetchCache',
  'dynamicParams',
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
  'config',
]);

interface Dead {
  readonly file: string;
  readonly name: string;
}

/**
 * 언급 횟수를 **한 번에** 센다.
 *
 * 처음에는 이름마다 전체 소스를 정규식으로 갈랐다. 내보내기가 천 개쯤이고
 * 소스가 몇 MB 라 이름 × 소스 만큼 일을 했고, **혼자 돌릴 때는 0.6초인데
 * 병렬로 도는 CI 에서 5초를 넘겨 졌다.**
 *
 * 산발적으로 지는 검사는 없는 검사보다 나쁘다 — 진짜 회귀를 봐도 "또
 * 그거겠지" 하고 넘기게 된다. 그래서 시간을 늘리지 않고 세는 방법을 바꿨다:
 * 소스를 한 번만 훑어 이름별 횟수를 세어 두고, 그다음은 찾아보기만 한다.
 */
function mentionCounts(): Map<string, number> {
  const counts = new Map<string, number>();
  for (const file of files(SEARCHED)) {
    const source = readFileSync(file, 'utf8');
    for (const token of source.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? []) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * 타입까지 보는 구역.
 *
 * 값과 함수는 어디서나 본다. **타입은 여기서만** 본다 — 밖에서 쓰는 패키지라면
 * "지금 아무도 안 쓴다" 가 지울 이유가 되지 않지만, 이 둘은 이 저장소 안에서만
 * 쓰인다(둘 다 private). 그래서 여기서는 안 쓰는 타입이 곧 죽은 타입이다.
 *
 * **실제로 마흔 개가 쌓여 있었다.** 대부분 스키마마다 붙이던 `z.infer` 별칭인데,
 * 한 번도 불린 적이 없다. 읽는 사람은 그것이 창구의 입력 모양이라고 믿고 따라가다가
 * 아무 데도 닿지 않는 것을 뒤늦게 안다 — 이 검사가 처음 생길 때 적어 둔 걱정이
 * 그대로 일어난 셈이다.
 */
const TYPES_TOO = ['packages/contract/src', 'packages/core/src'];

function deadExports(): Dead[] {
  const counts = mentionCounts();

  const dead: Dead[] = [];
  for (const file of files(DECLARED)) {
    const source = readFileSync(file, 'utf8');
    const rel = file.slice(ROOT.length + 1);
    const pattern = TYPES_TOO.some((dir) => rel.startsWith(dir))
      ? /^export (?:const|(?:async )?function|type|interface) (\w+)/gm
      : /^export (?:const|(?:async )?function) (\w+)/gm;

    for (const m of source.matchAll(pattern)) {
      const name = m[1]!;
      if (FRAMEWORK.has(name)) continue;

      // 자기 선언 한 번을 빼고 남는 언급이 있으면 살아 있다
      if ((counts.get(name) ?? 0) <= 1) dead.push({ file: rel, name });
    }
  }
  return dead;
}

describe('아무도 부르지 않는 값', () => {
  it('훑을 파일이 실제로 있다', () => {
    // 경로가 어긋나면 아래 검사가 조용히 통과한다
    expect(files(SEARCHED).length).toBeGreaterThan(200);
    expect(files(DECLARED).length).toBeGreaterThan(150);
  });

  it('스크립트 폴더를 훑는 자리에 넣었다', () => {
    /*
     * 이 한 줄이 빠져서 백필 스크립트가 쓰는 함수를 지웠다. 목록에 있는지를
     * 검사로 박아 둔다 — 다시 빠지면 멀쩡한 코드를 죽었다고 말하게 된다.
     */
    expect(SEARCHED).toContain('apps/web/scripts');
  });

  it('타입까지 보는 구역이 실제로 그 자리를 가리킨다', () => {
    // 경로가 어긋나면 타입은 아무도 안 보는 채로 다시 쌓인다
    for (const dir of TYPES_TOO) {
      expect(files([dir.split('/')[0] + '/' + dir.split('/')[1]]).length).toBeGreaterThan(0);
    }
    expect(files(DECLARED).some((f) => f.slice(ROOT.length + 1).startsWith(TYPES_TOO[0]!))).toBe(true);
  });

  it('죽은 값·함수·타입이 없다', () => {
    const dead = deadExports();
    expect(
      dead.map((d) => `${d.file} — ${d.name}`),
      '부르는 곳이 없다. 지우거나, 부를 자리를 만든다:\n' +
        dead.map((d) => `  ${d.file} — ${d.name}`).join('\n'),
    ).toEqual([]);
  });
});
