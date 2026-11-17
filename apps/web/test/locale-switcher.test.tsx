// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from './render';
import { LOCALES, LOCALE_LABEL, LOCALE_TAG } from '@shop/i18n';

const route = vi.hoisted(() => ({ path: '/search', query: 'q=코트&page=2' }));
vi.mock('next/navigation', () => ({
  usePathname: () => route.path,
  useSearchParams: () => new URLSearchParams(route.query),
}));

const { LocaleSwitcher } = await import('~/components/locale-switcher');

/**
 * 언어 고르기. **문장 아홉이 전부 안 돌았다.**
 *
 * **스크립트 없이도 동작해야 한다.** 평범한 폼 전송이라 누르면 서버가 쿠키를
 * 심고 보던 화면으로 돌려보낸다 — 클릭 핸들러로 만들면 스크립트가 막힌 환경에서
 * 언어만 못 바꾸게 된다. 그 선택은 **모양으로만 지켜진다**(method·action·submit),
 * 그래서 재는 자리가 없으면 다음 사람이 `onClick` 으로 바꿔도 아무도 모른다.
 */

const form = () => screen.getByRole('form', { name: '언어 선택' });
const buttons = () => within(form()).getAllByRole('button');
const hidden = () => form().querySelector<HTMLInputElement>('input[name="next"]')!;

describe('스크립트 없이도 바뀐다', () => {
  it('평범한 POST 폼이다 — 핸들러가 아니다', () => {
    render(<LocaleSwitcher />);

    expect(form()).toHaveAttribute('method', 'post');
    expect(form()).toHaveAttribute('action', '/api/locale');
  });

  it('고른 언어를 제출 단추의 값으로 보낸다', () => {
    render(<LocaleSwitcher />);

    for (const button of buttons()) {
      expect(button).toHaveAttribute('type', 'submit');
      expect(button).toHaveAttribute('name', 'locale');
    }
    expect(buttons().map((b) => b.getAttribute('value'))).toEqual([...LOCALES]);
  });
});

describe('돌아갈 자리', () => {
  it('보던 검색 결과를 잃지 않는다 — 조건까지 함께 싣는다', () => {
    /*
     * 한글은 퍼센트로 적혀 간다. 주소로 다시 쓰일 값이라 그래야 하고, 돌려보낼
     * 자리를 글자 그대로 넘기면 서버가 그 주소를 못 만든다.
     */
    render(<LocaleSwitcher />);

    expect(hidden().value).toBe(`/search?${new URLSearchParams('q=코트&page=2').toString()}`);
    expect(decodeURIComponent(hidden().value)).toBe('/search?q=코트&page=2');
  });

  it('조건이 없으면 주소만 싣는다 — 빈 물음표를 붙이지 않는다', () => {
    route.query = '';
    render(<LocaleSwitcher />);

    expect(hidden().value).toBe('/search');
    route.query = 'q=코트&page=2';
  });
});

describe('언어의 이름', () => {
  it('목록을 손으로 적지 않는다 — 말이 늘면 단추도 함께 늘어난다', () => {
    render(<LocaleSwitcher />);

    expect(buttons()).toHaveLength(LOCALES.length);
    expect(within(form()).getAllByRole('listitem')).toHaveLength(LOCALES.length);
  });

  it('각 언어를 그 언어로 적는다 — 일본어 쓰는 사람이 Japanese 를 찾기를 기대할 수 없다', () => {
    render(<LocaleSwitcher />);

    expect(buttons().map((b) => b.textContent)).toEqual(LOCALES.map((l) => LOCALE_LABEL[l]));
  });

  it('그 이름에 언어를 붙인다 — 낭독기가 제 발음으로 읽게', () => {
    render(<LocaleSwitcher />);

    expect(buttons().map((b) => b.getAttribute('lang'))).toEqual(
      LOCALES.map((l) => LOCALE_TAG[l]),
    );
  });
});

describe('지금 보고 있는 언어', () => {
  it('색이 아니라 이름으로 알린다', () => {
    /*
     * 밑줄과 글자색만으로는 낭독기에 아무 말이 안 간다. 지금 언어라는 사실이
     * 이름에 실려야 한다.
     */
    render(<LocaleSwitcher />);

    // 검사는 사전 아래에서 ko 로 그린다
    const marked = buttons().filter((b) => b.getAttribute('aria-current') === 'true');
    expect(marked.map((b) => b.getAttribute('value'))).toEqual(['ko']);
  });

  it('나머지에는 그 표시를 붙이지 않는다 — 셋 다 지금이면 뜻이 없다', () => {
    render(<LocaleSwitcher />);

    const others = buttons().filter((b) => b.getAttribute('value') !== 'ko');
    for (const button of others) {
      expect(button).not.toHaveAttribute('aria-current');
    }
  });
});
