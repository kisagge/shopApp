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

function deadExports(): Dead[] {
  const haystack = files(SEARCHED)
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');

  const dead: Dead[] = [];
  for (const file of files(DECLARED)) {
    const source = readFileSync(file, 'utf8');
    /*
     * 값과 함수만 본다. 타입과 인터페이스는 패키지의 공개 모양이라, 지금
     * 아무도 안 쓴다는 것이 지울 이유가 되지 않는다.
     */
    for (const m of source.matchAll(/^export (?:const|(?:async )?function) (\w+)/gm)) {
      const name = m[1]!;
      if (FRAMEWORK.has(name)) continue;

      // 자기 선언 한 번을 빼고 남는 언급이 있으면 살아 있다
      const mentions = haystack.split(new RegExp(`\\b${name}\\b`)).length - 1;
      if (mentions <= 1) dead.push({ file: file.slice(ROOT.length + 1), name });
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

  it('죽은 값·함수가 없다', () => {
    const dead = deadExports();
    expect(
      dead.map((d) => `${d.file} — ${d.name}`),
      '부르는 곳이 없다. 지우거나, 부를 자리를 만든다:\n' +
        dead.map((d) => `  ${d.file} — ${d.name}`).join('\n'),
    ).toEqual([]);
  });
});
