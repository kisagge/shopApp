// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/search',
  useSearchParams: () => new URLSearchParams('q=코트&sort=rating'),
}));

const { ThemeSwitcher } = await import('~/components/theme-switcher');

describe('화면 밝기 고르기 (화면)', () => {
  it('스크립트 없이도 동작한다 — 평범한 폼 전송이다', () => {
    /*
     * **이 검사가 이 파일의 요점이다.** 클릭 핸들러로 만들면 스크립트가
     * 막히거나 실패한 환경에서 밝기만 못 바꾼다. 무엇보다 이 값은 서버가
     * 첫 HTML 에 박아야 하는 값이라 어차피 서버를 거쳐야 한다.
     */
    const { container } = render(<ThemeSwitcher current="system" />);
    const form = container.querySelector('form');

    expect(form?.getAttribute('method')).toBe('post');
    expect(form?.getAttribute('action')).toBe('/api/theme');
    for (const button of screen.getAllByRole('button')) {
      expect(button.getAttribute('type'), button.textContent ?? '').toBe('submit');
    }
  });

  it('세 갈래를 모두 세운다', () => {
    render(<ThemeSwitcher current="system" />);
    for (const label of ['시스템 설정', '밝게', '어둡게']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('지금 고른 것을 색이 아니라 이름에 붙인다', () => {
    /*
     * 하필 **밝기를 고르는 화면**에서 "지금 이것" 을 색으로만 표시하면,
     * 그 색이 안 보이는 사람에게 아무 정보도 주지 못한다.
     */
    render(<ThemeSwitcher current="dark" />);

    expect(screen.getByRole('button', { name: '어둡게' }).getAttribute('aria-current')).toBe('true');
    expect(screen.getByRole('button', { name: '밝게' }).getAttribute('aria-current')).toBeNull();
  });

  it('밝기를 바꿨다고 보던 검색 결과를 잃지 않는다', () => {
    const { container } = render(<ThemeSwitcher current="system" />);
    const next = container.querySelector<HTMLInputElement>('input[name="next"]');

    expect(next?.value).toBe('/search?q=%EC%BD%94%ED%8A%B8&sort=rating');
  });

  it('폼에 이름이 있다 — 단추 셋만 떠 있으면 무엇을 고르는지 알 수 없다', () => {
    const { container } = render(<ThemeSwitcher current="light" />);
    expect(container.querySelector('form')?.getAttribute('aria-label')).toBe('화면 밝기 선택');
  });
});
