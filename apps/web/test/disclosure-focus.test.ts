import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 여는 순간 버튼이 사라지는 폼은 초점을 챙겨야 한다.
 *
 * 이 저장소에는 `!open` 이면 버튼만 그리고 열리면 그 자리를 폼이 차지하는
 * 모양이 여럿 있다. 평범한 disclosure 와 다르다 — 버튼이 남으면 초점도 거기
 * 남지만, **사라지면 `<body>` 로 떨어진다.** 키보드 사용자는 자기 자리를
 * 잃고, 낭독기는 무엇이 열렸는지 말하지 않는다.
 *
 * **자동 접근성 훑기가 구조적으로 못 잡는다.** axe 는 정지한 화면의 마크업을
 * 보지, 누른 뒤 초점이 어디로 갔는지는 보지 않는다. 그래서 마크업만으로는
 * 완벽해 보이는 채로 오래 남아 있었다.
 *
 * 규칙을 훅 하나에 뒀으니(useDisclosureFocus), **그 모양의 컴포넌트가 그것을
 * 쓰는지**를 여기서 지킨다.
 */

const COMPONENTS = join(__dirname, '..', 'src', 'components');

/**
 * 초점을 챙기지 않아도 되는 자리와 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return e.name.endsWith('.tsx') ? [full] : [];
  });
}

/**
 * 여는 버튼이 열린 뒤 사라지는가.
 *
 * `if (!open) { return <button …> }` 모양을 찾는다. 이 이른 반환이 곧
 * "열리면 이 버튼은 없다" 는 뜻이다.
 */
function vanishingTrigger(source: string): boolean {
  return /if\s*\(\s*!\s*open\s*\)\s*\{[\s\S]{0,600}?aria-expanded/.test(source);
}

describe('펼침 폼의 초점', () => {
  const files = walk(COMPONENTS).filter((f) => vanishingTrigger(readFileSync(f, 'utf8')));

  it('그런 모양의 컴포넌트를 실제로 찾아냈다', () => {
    // 정규식이 어긋나면 아래 검사가 조용히 통과한다. 지금 둘이다.
    expect(files.length).toBeGreaterThanOrEqual(2);
  });

  it.each(files.map((f) => f.slice(COMPONENTS.length + 1)))(
    '%s 가 초점을 챙긴다',
    (rel) => {
      if (rel in EXEMPT) return;
      const source = readFileSync(join(COMPONENTS, rel), 'utf8');
      expect(
        source,
        `${rel} 는 열리면 버튼이 사라진다. useDisclosureFocus 로 초점을 옮기거나, ` +
          '안 옮기는 이유를 EXEMPT 에 적는다.',
      ).toContain('useDisclosureFocus');
    },
  );

  it.each(files.map((f) => f.slice(COMPONENTS.length + 1)))(
    '%s 의 폼이 초점을 받을 수 있다',
    (rel) => {
      if (rel in EXEMPT) return;
      const source = readFileSync(join(COMPONENTS, rel), 'utf8');
      // 훅을 부르기만 하고 ref 와 tabIndex 를 안 달면 아무 일도 일어나지 않는다
      expect(source, `${rel} 에 panelRef 가 안 붙었다`).toContain('ref={panelRef}');
      expect(source, `${rel} 에 tabIndex={-1} 이 없다`).toContain('tabIndex={-1}');
      expect(source, `${rel} 에 triggerRef 가 안 붙었다`).toContain('ref={triggerRef}');
    },
  );
});
