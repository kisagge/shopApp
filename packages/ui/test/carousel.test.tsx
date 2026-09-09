// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('손가락으로 밀기', () => {
  /**
   * 폰에서 아무리 밀어도 안 넘어갔다. 화살표만 두었기 때문인데, 손으로
   * 만지는 화면에서 배너를 미는 것은 배우지 않아도 하는 동작이다.
   */
  const track = () => screen.getByLabelText(/좌우 화살표 키/);

  const swipe = (from: [number, number], to: [number, number]) => {
    const [x1, y1] = from;
    const [x2, y2] = to;
    fireEvent.touchStart(track(), { touches: [{ clientX: x1, clientY: y1 }] });
    fireEvent.touchEnd(track(), { changedTouches: [{ clientX: x2, clientY: y2 }] });
  };

  it('왼쪽으로 밀면 다음 장으로 간다', () => {
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    expect(screen.getByText('첫 배너 링크')).toBeVisible();

    swipe([300, 100], [120, 108]);
    expect(screen.getByText('둘 배너 링크')).toBeVisible();
  });

  it('오른쪽으로 밀면 앞 장으로 돈다', () => {
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    swipe([120, 100], [300, 96]);
    // 첫 장에서 뒤로 밀면 마지막으로 — 화살표와 같은 규칙이다
    expect(screen.getByText('셋 배너 링크')).toBeVisible();
  });

  it('세로로 민 것은 화면을 굴린 것이라 넘기지 않는다', () => {
    /*
     * 여기가 이 기능에서 가장 중요한 자리다. 목록을 내리려던 사람이 엉뚱한
     * 배너를 보게 되면, 손가락을 어디에 둬야 할지 알 수 없게 된다.
     */
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    swipe([200, 400], [160, 120]);
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });

  it('살짝 스친 것은 넘기지 않는다', () => {
    // 배너를 누르려다 손이 조금 밀린 것까지 넘김으로 읽으면 안 된다
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    swipe([200, 100], [180, 100]);
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });

  it('배너가 하나뿐이면 밀어도 아무 일이 없다', () => {
    render(<Carousel slides={[slides[0]!]} label="배너" intervalMs={0} />);
    const only = screen.getByText('첫 배너 링크').closest('div')!.parentElement!;
    fireEvent.touchStart(only, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(only, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });
});
