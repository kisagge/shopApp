import { describe, it, expect } from 'vitest';
import { LOCALES } from '@shop/i18n';
import { ko } from '@shop/i18n/messages/ko';
import { en } from '@shop/i18n/messages/en';
import { ja } from '@shop/i18n/messages/ja';

/**
 * **보이는 글자가 이름 안에서 낱말로 떨어져 있어야 한다.**
 *
 * 쪽 넘기기 링크는 눈에 `2` 만 보이고 이름은 `2쪽` 이었다. 영어(`Page 2`)는 띄어쓰기가 있어 멀쩡했는데
 * 한글·일본어는 붙어 있었다 — **한글과 숫자는 둘 다 "글자" 라서 `2쪽` 이 토큰 하나가 된다.** 그래서
 * 보이는 `2` 가 이름 안에 든 것으로 읽히지 않는다.
 *
 * 눈에 보이는 말로 음성 조작하는 사람에게 같은 일이다. 보이는 것은 `2` 인데 이름이 `2쪽` 한 덩어리면
 * 그 말이 닿지 않을 수 있다.
 *
 * **axe 4.13 은 글자 포함만 봐서 통과시켰고, 4.14 가 낱말 단위로 보면서 드러났다**(운영 화면 넷과
 * 마이페이지·결제에서 32곳). 의존성을 올려서 알게 된 것이지 새로 생긴 고장이 아니다.
 *
 * 그래서 사전 쪽에서 막는다. 값이 **숫자 자리로 시작하고 곧바로 글자가 붙는** 문구는, 그것이 이름으로
 * 쓰이는 순간 같은 일이 된다.
 */

const DICTS = { ko, en, ja } as const;

/**
 * 이름에 쓰이는 문구 — 번호를 끼우고 그 번호만 눈에 보이는 자리들.
 *
 * **손으로 적는다.** 사전의 모든 `{n}` 문구가 이름으로 쓰이는 것은 아니다(본문·제목·알림 문구가 훨씬
 * 많다). 여기 적힌 것은 "값이 곧 보이는 글자" 인 자리이고, 그 목록이 늘면 한 줄을 더한다.
 */
const NAME_KEYS = ['pager.page', 'nav.cartCount'] as const;

/** 한 열쇠의 문구들 — 사전은 글자 하나이거나 복수형 묶음이다 */
function variantsOf(entry: unknown): string[] {
  if (typeof entry === 'string') return [entry];
  if (entry && typeof entry === 'object') {
    return Object.values(entry).filter((v): v is string => typeof v === 'string');
  }
  return [];
}

/** 자리표시 바로 뒤에 글자가 붙어 있는가 — `{page}쪽` 은 걸리고 `{page} 쪽` 은 통과한다 */
const glued = (value: string) => /\{\w+\}[^\s\d\p{P}]/u.test(value);

describe('번호가 이름 안에서 낱말로 떨어져 있다', () => {
  it('세 말을 다 본다 — 한 말만 고치면 다른 말에서 같은 일이 난다', () => {
    expect(Object.keys(DICTS).sort()).toEqual([...LOCALES].sort());
  });

  it.each(
    NAME_KEYS.flatMap((key) =>
      (Object.keys(DICTS) as (keyof typeof DICTS)[]).map((loc) => [loc, key] as const),
    ),
  )('%s 의 %s', (loc, key) => {
    /*
     * **복수형 묶음을 건너뛰지 않는다.** 처음에는 글자가 아니면 그냥 돌아 나왔는데, 장바구니 이름이
     * 바로 그 모양(`{ one, other }`)이라 **검사가 조용히 통과했다.** 낱낱을 다 본다.
     */
    const variants = variantsOf(DICTS[loc][key]);
    expect(variants.length, '읽어 낸 문구가 없다 — 사전의 모양이 바뀌었다').toBeGreaterThan(0);

    for (const value of variants) {
      expect(
        glued(value),
        `${loc}/${key}: "${value}" — 자리표시 뒤에 글자가 붙어 있다. 띄우면 보이는 번호가 낱말로 떨어진다`,
      ).toBe(false);
    }
  });

  it('복수형 묶음에서도 낱낱을 본다 — 건너뛰면 장바구니 이름을 놓친다', () => {
    expect(variantsOf({ one: 'a', other: 'b' })).toEqual(['a', 'b']);
    expect(variantsOf('a')).toEqual(['a']);
  });

  it('붙은 것을 실제로 잡아낸다 — 규칙이 헛돌면 위가 전부 통과한다', () => {
    expect(glued('{page}쪽'), '한글').toBe(true);
    expect(glued('{page}ページ'), '일본어').toBe(true);
    expect(glued('{page} 쪽'), '띄운 한글').toBe(false);
    expect(glued('Page {page}'), '앞에 붙는 말').toBe(false);
    // 숫자나 문장부호가 뒤따르는 것은 낱말을 붙인 것이 아니다
    expect(glued('{count}, {total}'), '문장부호').toBe(false);
  });
});
