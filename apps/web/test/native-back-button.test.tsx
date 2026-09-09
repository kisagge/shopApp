// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from './render';

const native = vi.hoisted(() => ({
  isNativeShell: vi.fn(() => true),
  exitApp: vi.fn(),
  onBackButton: vi.fn<(h: (canGoBack: boolean) => void) => () => void>(),
}));
vi.mock('@shop/native', () => native);

const { NativeBackButton } = await import('~/components/native-back-button');

/** 셸이 뒤로 가기를 알려 주는 것을 흉내 낸다 */
let press: (canGoBack: boolean) => void;
const stop = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  native.isNativeShell.mockReturnValue(true);
  native.onBackButton.mockImplementation((h) => {
    press = h;
    return stop;
  });
});
afterEach(() => vi.useRealTimers());

describe('안드로이드 뒤로 가기', () => {
  it('되돌릴 곳이 있으면 되돌린다', () => {
    /*
     * **귀를 붙이는 순간 기본 동작이 사라진다.** 이걸 빠뜨리면 앱 안에서
     * 뒤로 가기가 아무 일도 안 하게 된다.
     */
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => undefined);
    render(<NativeBackButton />);

    act(() => press(true));

    expect(back).toHaveBeenCalledOnce();
    expect(native.exitApp).not.toHaveBeenCalled();
  });

  it('첫 화면에서 한 번 누르면 묻고 끝나지 않는다', () => {
    // 목록을 보다 무심코 누른 사람에게 즉시 종료는 사고에 가깝다
    render(<NativeBackButton />);

    act(() => press(false));

    expect(native.exitApp).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('한 번 더 누르면 종료됩니다.');
  });

  it('바로 한 번 더 누르면 닫는다', () => {
    render(<NativeBackButton />);

    act(() => press(false));
    act(() => { vi.advanceTimersByTime(500); });
    act(() => press(false));

    expect(native.exitApp).toHaveBeenCalledOnce();
  });

  it('시간이 지나면 처음부터다', () => {
    // 아까 한 번 눌렀다는 이유로 한참 뒤의 한 번이 앱을 닫으면 안 된다
    render(<NativeBackButton />);

    act(() => press(false));
    act(() => { vi.advanceTimersByTime(2_500); });
    act(() => press(false));

    expect(native.exitApp).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('묻는 말은 잠시 뒤 사라진다', () => {
    render(<NativeBackButton />);

    act(() => press(false));
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2_100); });
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('브라우저에서는 귀를 붙이지 않는다', () => {
    native.isNativeShell.mockReturnValue(false);
    render(<NativeBackButton />);

    expect(native.onBackButton).not.toHaveBeenCalled();
  });
});
