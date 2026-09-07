import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 뜻이 겹치는 마크업을 막는다.
 *
 * **같은 실수를 두 번 했다.** 상품 옵션과 결제 수단 둘 다
 * `<ul role="radiogroup">` 이었다. role 을 얹는 순간 ul 의 목록 의미가
 * 사라져서 그 안의 li 가 **갈 곳 없는 항목**이 된다 — 낭독기에는 "라디오
 * 그룹" 과 "목록" 이 겹쳐 들린다.
 *
 * 화면을 훑는 검사가 잡아 주긴 하는데, 그건 브라우저를 띄워야 하고 그 화면이
 * 훑기 목록에 있어야 한다. 결제 화면이 목록에 없어서 두 번째 것은 한참
 * 뒤에야 드러났다. 여기서 먼저 잡으면 쓰는 순간 걸린다.
 */

const SRC = join(process.cwd(), 'src');

/**
 * 목록 태그에 얹어도 되는 role.
 *
 * **listbox 는 맞다.** 그 안의 li 가 `role="option"` 을 직접 달아서 목록
 * 항목이 아니라 선택지가 되기 때문이다 — 자동완성이 그 규격을 그대로 쓴다.
 * radiogroup 이 틀렸던 이유는 반대다: 라디오는 안쪽 button 이 달고 있었고
 * li 는 아무 역할 없이 사이에 끼어 있었다.
 */
const ALLOWED = new Set(['listbox', 'list', 'presentation', 'none']);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * 주석을 걷어 낸다.
 *
 * 걷어 내지 않으면 **"예전에는 이랬다" 고 적어 둔 설명이 위반으로 잡힌다.**
 * 실제로 그랬다 — 같은 실수를 두 번 하지 않으려고 남긴 주석이 검사에 걸렸다.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('목록 태그와 role', () => {
  it('ul·ol 에 li 를 항목으로 받지 않는 role 을 얹지 않는다', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const source = stripComments(readFileSync(file, 'utf8'));
      for (const m of source.matchAll(/<(ul|ol)[^>]*\brole="([a-z]+)"/g)) {
        if (!ALLOWED.has(m[2]!)) offenders.push(`${relative(SRC, file)} — <${m[1]} role="${m[2]}">`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it('검사가 헛돌지 않는다 — 실제로 role 을 얹은 목록이 있다', () => {
    const found = walk(SRC).some((f) =>
      /<ul[^>]*\brole="listbox"/.test(stripComments(readFileSync(f, 'utf8'))),
    );
    expect(found).toBe(true);
  });
});

/**
 * role="radiogroup" 은 키보드 동작까지 갖춰야 한다.
 *
 * role 을 얹으면 낭독기는 **네이티브 라디오처럼 다뤄지리라 기대한다** —
 * 탭으로 들어와 화살표로 고르는 것. 버튼만 나열해 두면 마크업은 완벽한데
 * 화살표가 아무 일도 하지 않고, 항목 전부가 탭 순서에 남는다.
 *
 * **접근성 훑기가 구조적으로 못 잡는다.** axe 는 정지한 화면을 본다 —
 * role 도 aria-checked 도 제자리에 있으니 통과한다. 없는 것은 동작이다.
 */
describe('라디오 묶음은 키보드로 다룰 수 있다', () => {
  const files = walk(SRC).filter((f) => readFileSync(f, 'utf8').includes('role="radiogroup"'));

  it('라디오 묶음을 실제로 찾아냈다', () => {
    // 지금 둘이다(결제 수단 · 상품 옵션). 못 찾으면 아래가 조용히 통과한다.
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files.map((f) => f.slice(SRC.length + 1)))('%s 가 키보드 규칙을 쓴다', (rel) => {
    const source = readFileSync(join(SRC, rel), 'utf8');
    expect(
      source,
      `${rel} 의 라디오 묶음은 화살표로 옮겨 다닐 수 없다. useRadioGroup 을 쓴다.`,
    ).toContain('useRadioGroup');
    // 훅만 부르고 펼치지 않으면 아무 일도 일어나지 않는다
    expect(source, `${rel} 에 groupProps 가 안 붙었다`).toContain('groupProps');
    expect(source, `${rel} 에 radioProps 가 안 붙었다`).toContain('radioProps(');
  });
});
