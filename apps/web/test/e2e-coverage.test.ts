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

describe('e2e 파일이 빠짐없이 돌아간다', () => {
  const matchers = projectMatchers();
  const specs = readdirSync(E2E).filter((f) => /\.(spec|setup)\.ts$/.test(f));

  it('설정에서 프로젝트 규칙을 읽어 냈다', () => {
    // 정규식을 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(matchers.length).toBeGreaterThanOrEqual(4);
    expect(specs.length).toBeGreaterThan(20);
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
