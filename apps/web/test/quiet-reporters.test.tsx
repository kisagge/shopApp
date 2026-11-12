// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { WEB_VITAL, rateVital } from '@shop/core';

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));

const shell = vi.hoisted(() => ({ native: false }));
vi.mock('@shop/native', () => ({ isNativeShell: () => shell.native }));

/** 다섯 지표의 콜백을 손에 쥔다 — 라이브러리가 언제 부를지는 우리가 정한다 */
const vitals = vi.hoisted(() => {
  const reporters = new Map<string, (metric: unknown) => void>();
  const take = (key: string) => (fn: (metric: unknown) => void) => reporters.set(key, fn);
  return {
    reporters,
    onLCP: take('LCP'), onINP: take('INP'), onCLS: take('CLS'),
    onTTFB: take('TTFB'), onFCP: take('FCP'),
  };
});
vi.mock('web-vitals', () => vitals);

const { WebVitalsReporter } = await import('~/components/web-vitals-reporter');
const { ServiceWorker } = await import('~/components/service-worker');
const { TrackedProductList } = await import('~/components/tracked-product-list');

/**
 * **조용히 도는 조각 셋.** 화면에 아무것도 그리지 않고, 틀려도 아무 말이 없다 —
 * 성능 기록이 안 가고 있어도 화면은 멀쩡하고, 목록 추적이 빠져도 아무도 모른다.
 * 그래서 커버리지가 "문장 전부 안 돌았다" 로 찍어 줄 때까지 비어 있었다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  shell.native = false;
  vitals.reporters.clear();
});

describe('실사용자 성능 기록', () => {
  /*
   * **내 기계에서 잰 숫자는 아무것도 말해 주지 않는다.** 지하철에서 여는 사람의
   * 화면을 알려면 그 기기에서 재야 하고, 그 값이 제대로 실려 가는지가 이 조각의
   * 전부다.
   */
  const metric = (name: string, value: number, navigationType = 'navigate') =>
    ({ name, value, navigationType, rating: 'good', delta: value, id: 'v-1', entries: [] });

  it('다섯 지표를 전부 듣는다 — 목록은 core 가 쥔다', () => {
    render(<WebVitalsReporter />);

    expect([...vitals.reporters.keys()].sort()).toEqual([...WEB_VITAL].sort());
  });

  it.each(WEB_VITAL)('%s 를 받으면 그대로 올려 보낸다', (name) => {
    render(<WebVitalsReporter />);
    vitals.reporters.get(name)!(metric(name, 1_234.56));

    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0]![0]).toBe('web_vitals');
    expect((track.mock.calls[0]![1] as { metric: string }).metric).toBe(name);
  });

  it('CLS 만 소수로 두고 나머지는 밀리초로 반올림한다', () => {
    /*
     * CLS 는 길이가 아니라 비율이라 반올림하면 전부 0 이 된다. 반대로 LCP 를
     * 0.0001 초까지 저장해 봐야 읽는 사람에게 뜻이 없다.
     */
    render(<WebVitalsReporter />);
    vitals.reporters.get('CLS')!(metric('CLS', 0.123456));
    vitals.reporters.get('LCP')!(metric('LCP', 2_345.67));

    const values = track.mock.calls.map(([, props]) => (props as { value: number }).value);
    expect(values).toEqual([0.1235, 2_346]);
  });

  it('좋다·나쁘다는 core 가 정한 문턱으로 적는다 — 두 곳에서 다르게 재면 안 된다', () => {
    render(<WebVitalsReporter />);
    vitals.reporters.get('LCP')!(metric('LCP', 5_000));

    const props = track.mock.calls[0]![1] as { rating: string; navigationType: string };
    expect(props.rating).toBe(rateVital('LCP', 5_000));
    expect(props.rating).toBe('poor');
    expect(props.navigationType).toBe('navigate');
  });

  it('우리가 모르는 지표는 조용히 넘긴다 — 라이브러리가 하나 더 더해도 터지지 않는다', () => {
    render(<WebVitalsReporter />);
    vitals.reporters.get('LCP')!(metric('LoAF', 10));

    expect(track).not.toHaveBeenCalled();
  });
});

describe('서비스워커 등록', () => {
  const register = vi.fn(async () => ({}));

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    });
    register.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('첫 화면 그리기와 경쟁하지 않게 한 박자 미룬다', () => {
    render(<ServiceWorker />);
    expect(register).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1_000);

    expect(register).toHaveBeenCalledExactlyOnceWith('/sw.js');
  });

  it('앱 안에서는 등록하지 않는다 — 셸에 이미 자기 오프라인 화면이 있다', () => {
    shell.native = true;
    render(<ServiceWorker />);

    vi.advanceTimersByTime(5_000);

    expect(register).not.toHaveBeenCalled();
  });

  it('브라우저가 못 하는 일이면 묻지 않는다', () => {
    /*
     * **키가 아예 없는 것**이 지원하지 않는 브라우저다. `undefined` 를 넣어 두면
     * 키는 생기므로 `in` 검사가 통과하고, 그 뒤에서 터진다 — 흉내를 그렇게
     * 두었다가 한 번 졌다. 지원 여부를 값으로 보지 않는 것이 맞다.
     */
    delete (navigator as { serviceWorker?: unknown }).serviceWorker;
    render(<ServiceWorker />);

    expect(() => vi.advanceTimersByTime(5_000)).not.toThrow();
    expect(register).not.toHaveBeenCalled();
  });

  it('떠나면 기다리던 등록을 취소한다 — 사라진 화면이 뒤늦게 일하지 않게', () => {
    const { unmount } = render(<ServiceWorker />);
    unmount();

    vi.advanceTimersByTime(5_000);

    expect(register).not.toHaveBeenCalled();
  });

  it('등록이 실패해도 조용하다 — 없어도 사이트는 그대로 돈다', async () => {
    register.mockRejectedValue(new Error('거절'));
    render(<ServiceWorker />);

    vi.advanceTimersByTime(1_000);
    await expect(Promise.resolve()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalled();
  });
});

describe('목록의 노출과 클릭', () => {
  /*
   * 카드마다 핸들러를 달지 않고 한 번만 잡는다 — 카드는 순수 표현 컴포넌트로
   * 두고 추적을 섞지 않는다. 대신 **페이지가 붙여 준 id** 를 여기서 읽는다.
   */
  const list = (children: React.ReactNode, itemCount = 2) => (
    <TrackedProductList listId="home-new" itemCount={itemCount}>
      {children}
    </TrackedProductList>
  );

  const cards = (
    <>
      <a href="/product/coat" data-product-id="p-1">
        <span>울 코트</span>
      </a>
      <a href="/product/knit" data-product-id="p-2">니트</a>
      <p>이 줄은 상품이 아니다</p>
    </>
  );

  it('목록이 보이면 한 번 알린다', () => {
    render(list(cards));

    expect(track).toHaveBeenCalledExactlyOnceWith('view_item_list', {
      listId: 'home-new', itemCount: 2,
    });
  });

  it('더 보기로 목록이 늘어나도 한 번뿐이다 — 같은 목록을 두 번 세면 노출 수가 부푼다', () => {
    /*
     * **다시 그리는 것만으로는 드러나지 않는다.** 이펙트가 목록 이름과 개수에
     * 매여 있어서 같은 값으로는 아예 다시 돌지 않는다(돌연변이로 재 봤다).
     * ref 가 사는 자리는 **개수가 늘어날 때**다 — 더 보기로 뒤에 붙는 것은
     * 새 목록이 아니라 같은 목록이다.
     */
    const { rerender } = render(list(cards, 2));
    rerender(list(cards, 4));

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('카드 안쪽을 눌러도 그 상품으로 잡는다 — 글자를 눌렀는지 칸을 눌렀는지는 상관없다', async () => {
    render(list(cards));
    track.mockClear();

    await userEvent.click(screen.getByText('울 코트'));

    expect(track).toHaveBeenCalledExactlyOnceWith('select_item', {
      productId: 'p-1', listId: 'home-new',
    });
  });

  it('상품이 아닌 자리를 누르면 아무것도 보내지 않는다', async () => {
    render(list(cards));
    track.mockClear();

    await userEvent.click(screen.getByText('이 줄은 상품이 아니다'));

    expect(track).not.toHaveBeenCalled();
  });
});
