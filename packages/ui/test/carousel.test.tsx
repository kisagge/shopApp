// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Carousel } from '../src/components/carousel';
import { expectNoA11yViolations } from './a11y';

const slides = ['첫', '둘', '셋'].map((t, i) => ({
  id: `s-${i}`,
  content: <a href={`/x/${i}`}>{t} 배너 링크</a>,
}));

/** prefers-reduced-motion 을 흉내 낸다 */
function mockMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
}

beforeEach(() => mockMotion(false));
afterEach(() => vi.unstubAllGlobals());

describe('구조와 이름', () => {
  it('캐러셀로 읽히도록 역할 설명을 붙인다', () => {
    render(<Carousel slides={slides} label="기획전 배너" />);
    const region = screen.getByRole('region', { name: '기획전 배너' });
    expect(region.getAttribute('aria-roledescription')).toBe('캐러셀');
  });

  it('각 슬라이드가 몇 번째인지 밝힌다', () => {
    render(<Carousel slides={slides} label="기획전 배너" />);
    expect(screen.getByRole('group', { name: '3개 중 1번째' })).toBeDefined();
  });

  it('axe 위반이 없다', async () => {
    const { container } = render(<Carousel slides={slides} label="기획전 배너" />);
    await expectNoA11yViolations(container);
  });
});

describe('숨은 슬라이드', () => {
  it('보이지 않는 슬라이드의 링크에는 탭이 들어가지 않는다', () => {
    // 화면 밖 링크에 포커스가 가면 키보드 사용자는 안 보이는 곳으로 끌려간다
    render(<Carousel slides={slides} label="기획전 배너" />);
    const links = screen.getAllByRole('link', { hidden: true });
    const visible = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.textContent).toBe('첫 배너 링크');
  });
});

describe('조작', () => {
  it('다음 버튼으로 넘어간다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    await user.click(screen.getByRole('button', { name: /다음 배너/ }));
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('둘 배너 링크');
  });

  it('첫 슬라이드에서 이전을 누르면 마지막으로 돈다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    await user.click(screen.getByRole('button', { name: /이전 배너/ }));
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('셋 배너 링크');
  });

  it('점을 눌러 바로 이동한다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    await user.click(screen.getByRole('button', { name: '3번째 배너로 이동' }));
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('셋 배너 링크');
  });

  it('현재 위치를 aria-current 로도 알린다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    await user.click(screen.getByRole('button', { name: '2번째 배너로 이동' }));
    // 색으로만 알리면 흑백 화면이나 스크린리더에서는 알 수 없다
    expect(screen.getByRole('button', { name: '2번째 배너로 이동' }).getAttribute('aria-current'))
      .toBe('true');
  });

  it('좌우 화살표 키로 넘긴다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    await user.tab();
    await user.keyboard('{ArrowRight}');
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('둘 배너 링크');
    await user.keyboard('{ArrowLeft}');
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('첫 배너 링크');
  });

  it('사용자가 눌러 이동하면 알린다', async () => {
    const user = userEvent.setup();
    const { container } = render(<Carousel slides={slides} label="기획전 배너" />);
    await user.click(screen.getByRole('button', { name: /다음 배너/ }));
    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toBe('3개 중 2번째 배너');
  });

  it('처음에는 아무것도 알리지 않는다 — 자동 전환까지 읽으면 끝없이 떠든다', () => {
    const { container } = render(<Carousel slides={slides} label="기획전 배너" />);
    expect(container.querySelector('[aria-live="polite"]')?.textContent).toBe('');
  });
});

describe('자동 넘김', () => {
  it('간격이 지나면 넘어간다', async () => {
    vi.useFakeTimers();
    render(<Carousel slides={slides} label="기획전 배너" intervalMs={1000} />);
    await vi.advanceTimersByTimeAsync(1100);
    vi.useRealTimers();
    await waitFor(() =>
      expect(screen.getAllByRole('link')[0]?.textContent).toBe('둘 배너 링크'));
  });

  it('멈춤 버튼이 있다 — 움직이는 콘텐츠에는 멈출 수단이 필요하다', () => {
    render(<Carousel slides={slides} label="기획전 배너" />);
    expect(screen.getByRole('button', { name: '배너 자동 넘김 멈춤' })).toBeDefined();
  });

  it('멈추면 더 이상 넘어가지 않는다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" intervalMs={1000} />);
    await user.click(screen.getByRole('button', { name: '배너 자동 넘김 멈춤' }));
    expect(screen.getByRole('button', { name: '배너 자동 넘김 시작' })).toBeDefined();

    vi.useFakeTimers();
    await vi.advanceTimersByTimeAsync(3000);
    vi.useRealTimers();
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('첫 배너 링크');
  });

  it('움직임을 줄이라고 하면 자동으로 넘기지 않는다', async () => {
    // 취향이 아니라 전정기관 장애 대응이다
    mockMotion(true);
    vi.useFakeTimers();
    render(<Carousel slides={slides} label="기획전 배너" intervalMs={1000} />);
    await vi.advanceTimersByTimeAsync(5000);
    vi.useRealTimers();
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('첫 배너 링크');
  });

  it('움직임을 줄이면 멈춤 버튼도 그리지 않는다 — 멈출 것이 없다', () => {
    mockMotion(true);
    render(<Carousel slides={slides} label="기획전 배너" />);
    expect(screen.queryByRole('button', { name: /자동 넘김/ })).toBeNull();
  });

  it('intervalMs 가 0이면 자동으로 넘기지 않는다', async () => {
    vi.useFakeTimers();
    render(<Carousel slides={slides} label="기획전 배너" intervalMs={0} />);
    await vi.advanceTimersByTimeAsync(10_000);
    vi.useRealTimers();
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('첫 배너 링크');
  });
});

describe('배너가 하나뿐일 때', () => {
  const one = [slides[0]!];

  it('넘길 것이 없으므로 조작 장치를 그리지 않는다', () => {
    render(<Carousel slides={one} label="기획전 배너" />);
    expect(screen.queryByRole('button', { name: /다음 배너/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /배너로 이동/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /자동 넘김/ })).toBeNull();
  });

  it('내용은 그대로 보인다', () => {
    render(<Carousel slides={one} label="기획전 배너" />);
    expect(screen.getByRole('link', { name: '첫 배너 링크' })).toBeDefined();
  });
});

describe('배너가 없을 때', () => {
  it('아무것도 그리지 않는다', () => {
    const { container } = render(<Carousel slides={[]} label="기획전 배너" />);
    expect(container.firstChild).toBeNull();
  });
});
