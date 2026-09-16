import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 쪽을 넘기는 조회는 모두 범위를 넘은 쪽을 당긴다.
 *
 * **여덟 군데가 한꺼번에 같은 구멍을 갖고 있었다.** 쪽 번호를 붙이면서 받은 숫자를
 * 그대로 `offsetOf` 에 넣었고, 화면의 쪽 번호만 core 의 `pageNav` 로 당겨 그렸다.
 * 그래서 `?page=999` 는 마지막 쪽이 칠해진 채 목록만 빈 화면이 됐다.
 *
 * 한 군데를 고치고 나머지를 잊기 쉬운 모양이라(실제로 한 군데만 고친 채 커밋할 뻔했다)
 * 여기서 지킨다: `offsetOf` 를 쓰는 조회 파일은 `clampToLastPage` 도 써야 한다.
 */

const QUERIES = join(process.cwd(), 'src', 'lib', 'queries');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

describe('쪽 넘기기의 범위', () => {
  const files = walk(QUERIES).map((file) => ({ file, source: readFileSync(file, 'utf8') }));

  it('찾는 것이 있다 — 못 찾으면 아래가 전부 통과한다', () => {
    // 훑어서 아무것도 못 찾아도 "어긋난 것이 없다" 가 된다. 표 여백 검사에서 겪었다.
    const paging = files.filter(({ source }) => source.includes('offsetOf('));
    expect(paging.length, '쪽을 넘기는 조회를 하나도 못 찾았다').toBeGreaterThan(5);
  });

  it('offsetOf 를 쓰는 조회는 범위를 넘은 쪽을 당긴다', () => {
    const offenders = files
      .filter(({ file, source }) =>
        source.includes('offsetOf(')
        && !source.includes('clampToLastPage')
        // 도우미 자신은 offsetOf 를 쓰지 않지만, 앞으로를 위해 함께 빼 둔다
        && !file.endsWith(join('queries', 'paged.ts')))
      .map(({ file }) => relative(QUERIES, file));

    expect(
      offenders,
      '쪽 번호는 마지막 쪽을 가리켜 그리는데 목록만 비는 화면이 된다.\n'
        + 'clampToLastPage 로 감싼다(lib/queries/paged.ts).',
    ).toEqual([]);
  });
});
