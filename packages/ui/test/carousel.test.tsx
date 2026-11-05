// @vitest-environment jsdom
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
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

  it('민 뒤 곧바로 화살표를 눌러도 이어서 넘어간다', async () => {
    const user = userEvent.setup();
    render(<Carousel slides={slides} label="기획전 배너" />);
    swipe([300, 100], [100, 105]);
    await user.click(screen.getByRole('button', { name: /다음 배너/ }));
    expect(screen.getAllByRole('link')[0]?.textContent).toBe('셋 배너 링크');
  });

  it('배너가 하나뿐이면 밀어도 아무 일이 없다', () => {
    render(<Carousel slides={[slides[0]!]} label="배너" intervalMs={0} />);
    const only = screen.getByText('첫 배너 링크').closest('div')!.parentElement!;
    fireEvent.touchStart(only, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(only, { changedTouches: [{ clientX: 100, clientY: 100 }] });
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });
});

/**
 * 사용자가 넘긴 직후에 시계가 끼어들지 않는다.
 *
 * **신고된 증상은 "밀고 나서 곧바로 화살표를 누르면 안 움직인다" 였다.**
 * 버튼은 멀쩡했다 — 자동 넘김 시계가 사용자의 조작과 무관하게 6초마다
 * 울리고 있었고, 울리기 직전에 사람이 넘기면 곧바로 한 장 더 넘어갔다.
 * 배너가 둘이면 한 바퀴 돌아 **누르기 전과 같은 화면**이 된다.
 */
describe('사용자가 넘긴 직후의 자동 넘김', () => {
  it('사용자가 넘기면 자동 넘김 시계도 다시 시작한다', () => {
    vi.useFakeTimers();
    try {
      render(<Carousel slides={slides} label="기획전 배너" intervalMs={6000} />);

      // 울리기 직전까지 간다
      act(() => { vi.advanceTimersByTime(5900); });
      expect(screen.getAllByRole('link')[0]?.textContent).toBe('첫 배너 링크');

      // 그 자리에서 사람이 직접 넘긴다
      act(() => { screen.getByRole('button', { name: /다음 배너/ }).click(); });
      expect(screen.getAllByRole('link')[0]?.textContent).toBe('둘 배너 링크');

      // 방금 넘겼으니 0.1초 만에 또 넘어가면 안 된다
      act(() => { vi.advanceTimersByTime(100); });
      expect(
        screen.getAllByRole('link')[0]?.textContent,
        '사용자가 넘긴 지 0.1초 만에 저절로 또 넘어갔다',
      ).toBe('둘 배너 링크');

      // 온전히 6초가 지나면 그때 넘어간다
      act(() => { vi.advanceTimersByTime(6000); });
      expect(screen.getAllByRole('link')[0]?.textContent).toBe('셋 배너 링크');
    } finally {
      vi.useRealTimers();
    }
  });
});

/**
 * **읽는 중이면 넘기지 않는다.**
 *
 * 움직이는 배너 위에 마우스를 올리거나 안쪽 링크에 초점이 가면 사람이 그것을 읽고 있다는
 * 뜻이다. 그때 넘기면 읽던 글이 사라지고, 누르려던 링크가 **손가락 밑에서 바뀐다.**
 * (WCAG 2.2.2 — 움직이는 콘텐츠는 멈출 수 있어야 한다. 멈춤 단추는 그 요구의 다른 쪽이고,
 * 이쪽은 "읽는 동안은 저절로 멈춘다" 다.)
 *
 * **그 갈래가 한 번도 안 돌았다** — 커버리지를 켜서 찾았다. 멈추는 줄도, 치우면 다시
 * 흐르는 줄도. 자동 넘김 검사 다섯이 있었는데 전부 손을 안 댄 채로만 봤다.
 *
 * **멈춤과 재개를 한 검사에서 함께 본다.** 처음에는 둘로 나눴다가 "멈춘다" 쪽이 **공짜로
 * 통과**했다 — 진짜 타이머로 렌더한 뒤에 가짜 타이머를 걸어서 간격이 아예 울리지 않았고,
 * 안 움직이는 것이 당연했다. 재개를 같은 검사에서 보면 **그 절반이 타이머가 살아 있었음을
 * 증명**하므로 앞의 절반이 헛돌 수 없다.
 *
 * **기다리는 시간도 한 바퀴가 아니어야 한다.** 그 다음에는 3,000ms 를 기다렸는데 배너가
 * 셋이라 **세 번 넘어가 제자리로** 왔다 — 멈추는 줄을 지워도 검사가 통과했다. 돌연변이가
 * 그것을 잡았다. 간격 한 번 조금 넘게만 기다린다.
 *
 * `playing` 을 건드리지 않는 것이 요점이다. 멈춤 단추와 섞이면 **마우스를 치웠을 때 단추가
 * "시작" 으로 남아** 사람이 다시 눌러야 흐른다.
 */
describe('읽는 중에는 멈춘다', () => {
  const region = () => screen.getByRole('region', { name: '배너' });
  const first = () => screen.getAllByRole('link')[0]?.textContent;

  /** 가짜 타이머를 **렌더보다 먼저** 건다 — 뒤에 걸면 간격이 진짜 시계에 남는다 */
  const withFakeClock = async (body: () => Promise<void>) => {
    vi.useFakeTimers();
    try {
      await body();
    } finally {
      vi.useRealTimers();
    }
  };

  const tick = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };

  it('마우스를 올리면 멈추고, 치우면 다시 흐른다', async () => {
    await withFakeClock(async () => {
      render(<Carousel slides={slides} label="배너" intervalMs={1000} />);

      fireEvent.mouseEnter(region());
      // 한 바퀴가 아닌 시간만 기다린다 — 세 장이라 3,000ms 면 제자리로 돌아온다
      await tick(1100);
      expect(first()).toBe('첫 배너 링크');

      fireEvent.mouseLeave(region());
      await tick(1100);
      expect(first()).toBe('둘 배너 링크');

      // 멈춤 단추는 그대로 "멈춤" 이다 — 사람이 누른 적이 없으니까
      expect(screen.getByRole('button', { name: '배너 자동 넘김 멈춤' })).toBeDefined();
    });
  });

  /** 키보드로 읽는 사람도 같다 — 초점이 안에 있으면 읽는 중이다 */
  it('안쪽에 초점이 가면 멈추고, 떠나면 다시 흐른다', async () => {
    await withFakeClock(async () => {
      render(<Carousel slides={slides} label="배너" intervalMs={1000} />);
      const link = screen.getAllByRole('link')[0]!;

      fireEvent.focusIn(link);
      await tick(1100);
      expect(first()).toBe('첫 배너 링크');

      fireEvent.focusOut(link);
      await tick(1100);
      expect(first()).toBe('둘 배너 링크');
    });
  });

  /** 손대지 않으면 그 사이에 넘어간다 — 위의 "멈춘다" 가 타이머 탓이 아님을 못 박는다 */
  it('손대지 않으면 같은 시간에 넘어간다', async () => {
    await withFakeClock(async () => {
      render(<Carousel slides={slides} label="배너" intervalMs={1000} />);

      await tick(1100);

      expect(first()).toBe('둘 배너 링크');
    });
  });
});

/**
 * **끝만 온 터치.**
 *
 * 밀기는 시작과 끝 두 사건으로 재는데, 끝이 시작 없이 올 수 있다 — 손가락이 배너 밖에서
 * 들어와 여기서 떨어질 때, 또는 다른 요소가 시작 사건을 삼켰을 때. 그때 시작점이 없는
 * 채로 셈하면 `null` 에서 좌표를 읽는다.
 *
 * **`not.toThrow()` 로는 못 잡는다.** React 가 핸들러의 오류를 삼켜 `fireEvent` 밖으로
 * 올리지 않는다 — 돌연변이로 걸러 낸 줄을 지워 봤더니 검사가 그대로 통과했다. 실제로
 * 관측되는 것은 **window 의 `error` 사건**이고(브라우저에서도 그렇다), 그것을 본다.
 */
describe('밀기가 반쪽으로 올 때', () => {
  const track = () => screen.getByLabelText(/좌우 화살표 키/);

  /** 핸들러가 터지면 여기 담긴다 — 아무 일도 없어야 비어 있다 */
  const watchErrors = (body: () => void): string[] => {
    const seen: string[] = [];
    const onError = (event: ErrorEvent) => void seen.push(event.message);
    window.addEventListener('error', onError);
    try {
      body();
    } finally {
      window.removeEventListener('error', onError);
    }
    return seen;
  };

  it('시작 없이 끝만 와도 터지지 않는다', () => {
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);

    const errors = watchErrors(() => {
      fireEvent.touchEnd(track(), { changedTouches: [{ clientX: 10, clientY: 100 }] });
    });

    expect(errors).toEqual([]);
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });

  it('손가락 정보 없이 끝나도 터지지 않는다', () => {
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    fireEvent.touchStart(track(), { touches: [{ clientX: 300, clientY: 100 }] });

    const errors = watchErrors(() => {
      fireEvent.touchEnd(track(), { changedTouches: [] });
    });

    expect(errors).toEqual([]);
    expect(screen.getByText('첫 배너 링크')).toBeVisible();
  });

  /** 그 뒤에 제대로 밀면 그대로 넘어간다 — 반쪽 터치가 상태를 망가뜨리지 않았는지 */
  it('반쪽 터치 뒤에도 제대로 밀면 넘어간다', () => {
    render(<Carousel slides={slides} label="배너" intervalMs={0} />);
    fireEvent.touchEnd(track(), { changedTouches: [{ clientX: 10, clientY: 100 }] });

    fireEvent.touchStart(track(), { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(track(), { changedTouches: [{ clientX: 120, clientY: 108 }] });

    expect(screen.getByText('둘 배너 링크')).toBeVisible();
  });
});
