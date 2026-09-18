import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * e2e 파일은 전부 어느 프로젝트엔가 잡혀 있어야 한다.
 *
 * playwright.config 의 프로젝트는 **파일 이름 정규식**으로 파일을 고른다.
 * 목록에 넣는 것을 잊거나 이름을 살짝 다르게 쓰면 그 파일은 **조용히 한 번도
 * 안 돈다** — 실패도 경고도 없이 통과한 것처럼 보인다. 검사를 새로 쓰고
 * 안심하는 것이 가장 위험한 자리다.
 *
 * 상한 검사를 결제·운영 화면까지 넓히면서 파일 이름에 기대게 됐다.
 * 그 기댐을 이 검사가 받친다.
 */

const E2E = join(__dirname, '..', 'e2e');
const CONFIG = join(__dirname, '..', 'playwright.config.ts');

/** `testMatch: /…/` 의 정규식 리터럴만 뽑는다 */
function projectMatchers(): RegExp[] {
  const source = readFileSync(CONFIG, 'utf8');
  const found = [...source.matchAll(/testMatch:\s*\n?\s*\/(.+?)\/[gimsuy]*\s*[,}]/g)];
  return found.map(([, body = '']) => new RegExp(body));
}

/** 프로젝트 이름 — 어느 프로젝트가 겹쳐 잡는지 말해 주려고 함께 읽는다 */
function projectNames(): string[] {
  const source = readFileSync(CONFIG, 'utf8');
  return [...source.matchAll(/name:\s*'([^']+)'/g)].map(([, name = '']) => name);
}

describe('e2e 파일이 빠짐없이 돌아간다', () => {
  const matchers = projectMatchers();
  const specs = readdirSync(E2E).filter((f) => /\.(spec|setup)\.ts$/.test(f));

  it('설정에서 프로젝트 규칙을 읽어 냈다', () => {
    // 정규식을 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(matchers.length).toBeGreaterThanOrEqual(4);
    expect(specs.length).toBeGreaterThan(20);
  });

  /**
   * **두 프로젝트가 같은 파일을 잡으면 같은 명세가 두 번 돈다.**
   *
   * 이름에 `admin` 이 든 파일은 운영 프로젝트가 통째로 잡는다(`/(admin|…)/`). 그래서 새로 만든
   * `merchant-suspension-admin.spec.ts` 가 손님 프로젝트와 운영 프로젝트에서 동시에 돌았고, 둘이 같은 가맹점을
   * 멈췄다 풀었다 하며 서로 밀쳐 한 판이 졌다. 두 판이 각자 로그인·시드 데이터를 쥐는 명세라면 어디서든
   * 같은 일이 난다 — 이름을 고르는 순간에 걸린다.
   */
  it('두 프로젝트가 같은 파일을 잡지 않는다', () => {
    const names = projectNames();
    const clashes = specs
      .map((f) => ({ file: f, by: matchers.flatMap((re, i) => (re.test(f) ? [names[i] ?? `#${i}`] : [])) }))
      .filter((r) => r.by.length > 1);

    expect(
      clashes,
      '이 파일들은 여러 프로젝트에서 동시에 돈다. 같은 시드 데이터를 쥐면 서로 밀친다.\n' +
        '파일 이름을 다른 프로젝트의 testMatch 에 걸리지 않게 바꾼다:\n' +
        clashes.map((c) => `${c.file} — ${c.by.join(', ')}`).join('\n'),
    ).toEqual([]);
  });

  it('어느 프로젝트에도 안 잡히는 파일이 없다', () => {
    const orphans = specs.filter((f) => !matchers.some((re) => re.test(f)));

    expect(
      orphans,
      '이 파일들은 한 번도 실행되지 않는다. playwright.config 의 프로젝트 ' +
        'testMatch 에 이름을 넣거나, 잡히는 이름으로 바꾼다:\n' +
        orphans.join('\n'),
    ).toEqual([]);
  });
});
