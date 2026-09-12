import { describe, it, expect } from 'vitest';
import { THEMES, THEME_COOKIE, isTheme, themeAttribute } from '../src/theme';

describe('화면 밝기', () => {
  it('셋이다 — 시스템을 지운 둘로 만들지 않는다', () => {
    /*
     * **둘로 만들면 "OS 를 따른다" 를 말할 방법이 없다.** 한 번 고른 사람은
     * 다시는 기기 설정을 따라갈 수 없게 되고, 저녁에 어두워지는 기기를 쓰는
     * 사람에게 그것은 기능이 아니라 함정이다.
     */
    expect(THEMES).toEqual(['system', 'light', 'dark']);
  });

  it('쿠키에서 오는 값은 아무거나일 수 있다', () => {
    for (const theme of THEMES) expect(isTheme(theme), theme).toBe(true);

    // 남이 넣거나 옛 값이 남아 있을 수 있다
    const junk: unknown[] = ['Dark', 'auto', '', ' light', null, undefined, 0, {}];
    for (const [at, value] of junk.entries()) {
      expect(isTheme(value), `${at}번째`).toBe(false);
    }
  });

  it('시스템일 때는 표시를 아예 안 붙인다', () => {
    /*
     * **없는 것이 곧 "OS 를 따른다" 다.** `data-theme="system"` 을 박으면
     * CSS 가 그 값도 알아야 하고, `:root:not([data-theme="light"])` 안에서
     * OS 를 따르는 길이 하나 더 갈린다.
     */
    expect(themeAttribute('system')).toBeUndefined();
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
  });

  it('쿠키 이름이 언어와 같은 앞가지를 쓴다', () => {
    // 같은 도메인에 다른 것이 붙어도 우리 것만 골라 볼 수 있다
    expect(THEME_COOKIE).toMatch(/^shop\./);
  });
});
