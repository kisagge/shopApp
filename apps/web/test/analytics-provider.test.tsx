// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from './render';

const path = vi.hoisted(() => ({ current: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => path.current }));

const tracker = vi.hoisted(() => ({
  track: vi.fn<(...a: any[]) => any>(),
  flush: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('~/lib/analytics/client', () => ({ getTracker: () => tracker }));

const { AnalyticsProvider } = await import('~/components/analytics-provider');

/**
 * 페이지 이동을 기록하고, 떠날 때 큐를 비운다. **문장 25개 전부가 안 돌았다.**
 *
 * App Router 는 클라이언트 내비게이션이라 브라우저 기본 페이지뷰가 안 잡힌다 —
 * 경로 변화로 직접 찍는다. 그래서 **같은 경로로 다시 그려도 한 번만** 찍어야
 * 하고(부모가 다시 그릴 때마다 찍으면 수가 부풀고), 떠나는 길은 **둘 다** 들어야
 * 한다(하나만으로는 새는 경로가 있다 — 실제로 겪어서 적힌 주석이다).
 */

const provider = (consent?: boolean) =>
  render(consent === undefined ? <AnalyticsProvider /> : <AnalyticsProvider consent={consent} />);

beforeEach(() => {
  vi.clearAllMocks();
  path.current = '/';
});

describe('페이지뷰', () => {
  it('붙자마자 한 번 찍는다', () => {
    provider();

    expect(tracker.track).toHaveBeenCalledExactlyOnceWith('page_view');
  });

  it('경로가 바뀌면 다시 찍는다', () => {
    const { rerender } = provider();
    path.current = '/category/outer';
    rerender(<AnalyticsProvider />);

    expect(tracker.track).toHaveBeenCalledTimes(2);
  });

  it('같은 경로로 다시 그려도 한 번뿐이다 — 아니면 수가 부푼다', () => {
    const { rerender } = provider();
    rerender(<AnalyticsProvider />);
    rerender(<AnalyticsProvider consent />);

    expect(tracker.track).toHaveBeenCalledTimes(1);
  });

  it('왔다 갔다 하면 그때마다 찍는다 — 되돌아온 것도 한 번의 방문이다', () => {
    const { rerender } = provider();
    path.current = '/cart';
    rerender(<AnalyticsProvider />);
    path.current = '/';
    rerender(<AnalyticsProvider />);

    expect(tracker.track).toHaveBeenCalledTimes(3);
  });

  it('아무것도 그리지 않는다 — 기록만 하는 조각이다', () => {
    const { container } = provider();

    expect(container).toBeEmptyDOMElement();
  });
});

describe('동의', () => {
  it('아직 모르면 아무것도 비우지 않는다 — 서버가 답을 주기 전이다', () => {
    provider(undefined);

    expect(tracker.flush).not.toHaveBeenCalled();
  });

  it('껐으면 들고 있던 것을 비운다 — 계정 설정이 로컬 값보다 앞선다', () => {
    provider(false);

    expect(tracker.flush).toHaveBeenCalledExactlyOnceWith();
  });

  it('켰으면 비우지 않는다', () => {
    provider(true);

    expect(tracker.flush).not.toHaveBeenCalled();
  });

  it('동의가 바뀌는 순간에만 다시 본다', () => {
    const { rerender } = provider(true);
    rerender(<AnalyticsProvider consent />);
    expect(tracker.flush).not.toHaveBeenCalled();

    rerender(<AnalyticsProvider consent={false} />);
    expect(tracker.flush).toHaveBeenCalledTimes(1);
  });
});

describe('떠나는 길', () => {
  it('탭을 감추면 끝까지 보낸다', () => {
    provider();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(tracker.flush).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('다시 보이는 것은 떠나는 것이 아니다', () => {
    provider();
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(tracker.flush).not.toHaveBeenCalled();
  });

  it('같은 탭에서 다른 문서로 가도 끝까지 보낸다 — 상품 카드가 <a> 라 전체 로드가 난다', () => {
    /*
     * `pagehide` 를 빼먹으면 클릭 직후 이동하는 이벤트가 통째로 유실된다.
     * `visibilitychange` 하나로는 안 되는 경로가 그것이다.
     */
    provider();
    window.dispatchEvent(new Event('pagehide'));

    expect(tracker.flush).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('떼어 낸 뒤에는 듣지 않는다 — 떠난 조각이 큐를 건드리면 안 된다', () => {
    const { unmount } = provider();
    unmount();

    window.dispatchEvent(new Event('pagehide'));
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));

    expect(tracker.flush).not.toHaveBeenCalled();
  });
});
