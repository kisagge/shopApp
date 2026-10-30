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

const SRC = join(__dirname, '..', 'src');

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
 * `if (!open) { … setOpen(true) … }` 모양을 찾는다. 이 이른 반환이 곧 "열리면 이 버튼은 없다" 는 뜻이다.
 *
 * **예전에는 `aria-expanded` 를 표식으로 썼다.** 그랬더니 그 속성이 없는 조각은 탐지를 빠져나갔다 —
 * 정작 고쳐야 할 쪽이 빠진다. `components/order-address-edit` 가 훑는 범위 안에 있으면서도 그렇게
 * 새 나갔다. 표식은 **그 모양 자체**(열면 사라지는 단추)여야 한다.
 */
function vanishingTrigger(source: string): boolean {
  return /if\s*\(\s*!\s*open\s*\)\s*\{[\s\S]{0,800}?setOpen\(\s*true\s*\)/.test(source);
}

describe('펼침 폼의 초점', () => {
  /*
   * **`components` 만 훑고 있었다.** 같은 모양이 운영 화면(`app/admin/**`)에 다섯 더 있었고 —
   * 등급 올리기·이용 정지·정산 보류·브랜드 등록·갈래 추가 — 그물 밖이라 아무도 안 봤다.
   * 셋은 초점이 `<body>` 로 떨어졌고, 셋은 열 때만 칸으로 옮기고 닫을 때는 아무것도 하지 않았다.
   *
   * 화면 조각이 `components` 에만 사는 저장소가 아니다. `src` 전체를 훑는다.
   */
  const files = walk(SRC).filter((f) => vanishingTrigger(readFileSync(f, 'utf8')));

  it('그런 모양의 컴포넌트를 실제로 찾아냈다', () => {
    // 정규식이 어긋나면 아래 검사가 조용히 통과한다. 지금 아홉이다.
    expect(files.length).toBeGreaterThanOrEqual(9);
  });

  it.each(files.map((f) => f.slice(SRC.length + 1)))(
    '%s 가 초점을 챙긴다',
    (rel) => {
      if (rel in EXEMPT) return;
      const source = readFileSync(join(SRC, rel), 'utf8');
      /*
       * **이름이 아니라 부른 자리를 본다.** 글자만 찾으면 `import { useDisclosureFocus }` 한 줄로
       * 통과한다 — 훅을 부르지 않고 ref 를 손으로 만들어도 몰랐다(그렇게 돌연변이가 새 나갔다).
       * 타입을 주고 부르는 모양(`useDisclosureFocus<HTMLElement>(open)`)도 함께 받는다.
       */
      expect(
        /useDisclosureFocus(<[^>]*>)?\s*\(/.test(source),
        `${rel} 는 열리면 버튼이 사라진다. useDisclosureFocus 를 불러 초점을 옮기거나, ` +
          '안 옮기는 이유를 EXEMPT 에 적는다.',
      ).toBe(true);
    },
  );

  it.each(files.map((f) => f.slice(SRC.length + 1)))(
    '%s 의 단추가 펼침 상태를 말한다',
    (rel) => {
      /*
       * **초점만 챙기면 반쪽이다.** 낭독기는 그 단추가 무언가를 펼치는 단추인지 모른 채 읽는다 —
       * 눌러 보고 나서야 안다. 여섯 곳 모두 이 속성이 없었다.
       */
      if (rel in EXEMPT) return;
      const source = readFileSync(join(SRC, rel), 'utf8');
      expect(source, `${rel} 의 여는 단추에 aria-expanded 가 없다`).toContain('aria-expanded');
      expect(source, `${rel} 의 단추가 어느 판을 펼치는지 가리키지 않는다`).toContain('aria-controls');
    },
  );

  it.each(files.map((f) => f.slice(SRC.length + 1)))(
    '%s 의 폼이 초점을 받을 수 있다',
    (rel) => {
      if (rel in EXEMPT) return;
      const source = readFileSync(join(SRC, rel), 'utf8');
      // 훅을 부르기만 하고 ref 와 tabIndex 를 안 달면 아무 일도 일어나지 않는다
      expect(source, `${rel} 에 panelRef 가 안 붙었다`).toContain('ref={panelRef}');
      expect(source, `${rel} 에 tabIndex={-1} 이 없다`).toContain('tabIndex={-1}');
      expect(source, `${rel} 에 triggerRef 가 안 붙었다`).toContain('ref={triggerRef}');
    },
  );
});


/**
 * 줄마다 지우기 버튼이 있는 목록은 초점을 챙겨야 한다.
 *
 * 펼침 폼과 같은 뿌리다 — **버튼이 자기 줄과 함께 사라진다.** 다만 갈 곳이
 * 다르다. 누른 버튼이 영영 없으므로 옆 줄로 간다(useRemovalFocus).
 *
 * 손님 화면 하나를 고치고 나서 같은 모양을 폴더에서 찾아보니 다섯이 더
 * 있었다. 손으로 세었을 때는 아홉이라고 했는데 그중 셋은 지우기 버튼이
 * 아니었다 — **그래서 사람이 세지 않게 한다.**
 */
describe('목록에서 줄을 지울 때의 초점', () => {
  function walkAll(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const full = join(dir, e.name);
      if (e.isDirectory()) return walkAll(full);
      return e.name.endsWith('.tsx') ? [full] : [];
    });
  }

  /**
   * 이미 초점을 챙기는 파일에는 data-remove-row 표시가 있다. 그 표시를 단
   * 파일이 훅도 쓰는지 본다 — 표시만 달고 훅을 안 부르면 아무 일도 안 난다.
   */
  const marked = walkAll(SRC).filter((f) => readFileSync(f, 'utf8').includes('data-remove-row'));

  it('그런 목록을 실제로 찾아냈다', () => {
    // 지금 여섯이다. 표시가 사라지면 아래 검사가 조용히 통과한다.
    expect(marked.length).toBeGreaterThanOrEqual(6);
  });

  it.each(marked.map((f) => f.slice(SRC.length + 1)))('%s 가 초점을 챙긴다', (rel) => {
    const source = readFileSync(join(SRC, rel), 'utf8');
    expect(source, `${rel} 에 useRemovalFocus 가 없다`).toContain('useRemovalFocus');
    expect(source, `${rel} 에 listRef 가 안 붙었다`).toContain('ref={listRef');
    expect(source, `${rel} 가 지운 자리를 기억하지 않는다`).toContain('rememberRemoval(');
  });
});
