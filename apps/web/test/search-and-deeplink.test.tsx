// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from './render';

const track = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/analytics/client', () => ({ track }));

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace, refresh: vi.fn() }) }));

const shell = vi.hoisted(() => ({
  native: false,
  handler: null as ((path: string) => void) | null,
  unsubscribed: 0,
}));
vi.mock('@shop/native', () => ({
  isNativeShell: () => shell.native,
  onAppUrlOpen: (handler: (path: string) => void) => {
    shell.handler = handler;
    return () => {
      shell.unsubscribed += 1;
    };
  },
}));

const { TrackedSearch } = await import('~/components/tracked-search');
const { NativeDeepLink } = await import('~/components/native-deep-link');

/**
 * 조용히 도는 조각 둘 — 검색 이벤트와 앱의 딥링크. 문장 열일곱이 전부 안 돌았다.
 */

beforeEach(() => {
  vi.clearAllMocks();
  shell.native = false;
  shell.handler = null;
  shell.unsubscribed = 0;
});

describe('검색 이벤트', () => {
  /*
   * **0건 검색이 무엇이었는지가 가장 값진 신호다** — 찾는데 없는 물건이거나,
   * 우리 검색이 못 찾는 물건이거나 둘 중 하나다. 그래서 결과 수까지 함께 남긴다.
   */
  it('찾은 말과 결과 수를 함께 남긴다', () => {
    render(<TrackedSearch term="울 코트" resultCount={12} />);

    expect(track).toHaveBeenCalledExactlyOnceWith('search', { query: '울 코트', resultCount: 12 });
  });

  it('0건도 남긴다 — 빠뜨리면 못 찾은 말이 하나도 안 쌓인다', () => {
    render(<TrackedSearch term="없는 물건" resultCount={0} />);

    expect(track).toHaveBeenCalledExactlyOnceWith('search', { query: '없는 물건', resultCount: 0 });
  });

  it('같은 검색을 다시 그려도 한 번뿐이다', () => {
    const { rerender } = render(<TrackedSearch term="코트" resultCount={3} />);
    rerender(<TrackedSearch term="코트" resultCount={3} />);

    expect(track).toHaveBeenCalledTimes(1);
  });

  it('다른 말로 찾으면 다시 남긴다', () => {
    const { rerender } = render(<TrackedSearch term="코트" resultCount={3} />);
    rerender(<TrackedSearch term="니트" resultCount={3} />);

    expect(track).toHaveBeenCalledTimes(2);
    expect(track.mock.calls[1]![1]).toEqual({ query: '니트', resultCount: 3 });
  });

  it('같은 말인데 결과 수가 달라지면 다시 남긴다 — 어제 0건이던 말이 오늘 찾아진다', () => {
    /*
     * 재고가 들어오거나 상품이 올라가면 같은 말의 결과가 달라진다. 말만 보고
     * 건너뛰면 그 변화가 안 쌓인다.
     */
    const { rerender } = render(<TrackedSearch term="코트" resultCount={0} />);
    rerender(<TrackedSearch term="코트" resultCount={5} />);

    expect(track).toHaveBeenCalledTimes(2);
    expect(track.mock.calls[1]![1]).toEqual({ query: '코트', resultCount: 5 });
  });

  it('아무것도 그리지 않는다 — 기록만 하는 조각이다', () => {
    const { container } = render(<TrackedSearch term="코트" resultCount={1} />);

    expect(container).toBeEmptyDOMElement();
  });
});

describe('앱의 딥링크', () => {
  /*
   * **셸이 이미 우리 도메인을 띄우고 있어도 자동으로 옮겨 가지 않는다.** 밖에서
   * 상품 링크를 눌러 앱이 뜨면 웹뷰는 마지막으로 보던 자리에 그대로 있고,
   * 사용자는 자기가 누른 상품이 아니라 엉뚱한 화면을 만난다.
   */
  it('브라우저에서는 듣지 않는다 — 이 신호가 없다', () => {
    render(<NativeDeepLink />);

    expect(shell.handler).toBeNull();
  });

  it('앱에서는 링크를 듣는다', () => {
    shell.native = true;
    render(<NativeDeepLink />);

    expect(shell.handler).not.toBeNull();
  });

  it('받은 자리로 옮긴다', () => {
    shell.native = true;
    render(<NativeDeepLink />);

    shell.handler!('/product/wool-coat');

    expect(push).toHaveBeenCalledExactlyOnceWith('/product/wool-coat');
  });

  it('replace 가 아니라 push 다 — replace 면 뒤로 가기가 앱을 그냥 닫는다', () => {
    shell.native = true;
    render(<NativeDeepLink />);

    shell.handler!('/product/wool-coat');

    expect(replace).not.toHaveBeenCalled();
  });

  it('떠나면 듣기를 끊는다 — 사라진 화면이 뒤늦게 옮기지 않게', () => {
    shell.native = true;
    const { unmount } = render(<NativeDeepLink />);

    unmount();

    expect(shell.unsubscribed).toBe(1);
  });

  it('아무것도 그리지 않는다', () => {
    shell.native = true;
    const { container } = render(<NativeDeepLink />);

    expect(container).toBeEmptyDOMElement();
  });
});
