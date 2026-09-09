// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';

const native = vi.hoisted(() => ({ nativeShare: vi.fn<(o: unknown) => Promise<boolean>>() }));
vi.mock('@shop/native', () => native);

const analytics = vi.hoisted(() => ({ track: vi.fn() }));
vi.mock('~/lib/analytics/client', () => analytics);

const { ShareButton } = await import('~/components/share-button');

/**
 * 공유는 **길이 셋인데 어느 것이 열려 있는지 기기마다 다르다.**
 * 여기서 지키는 것은 하나다 — 어느 기기에서 눌러도 아무 일도 없는 상태가
 * 되지 않는다.
 */
const clipboard = { writeText: vi.fn<(t: string) => Promise<void>>() };

beforeEach(() => {
  vi.clearAllMocks();
  native.nativeShare.mockResolvedValue(false);
  clipboard.writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'share');
});

const press = async () => {
  render(<ShareButton productId="p1" productName="오버사이즈 코트" />);
  await userEvent.click(screen.getByRole('button', { name: '공유하기' }));
};

describe('공유 버튼', () => {
  it('앱 안이면 시스템 시트로 나간다', async () => {
    native.nativeShare.mockResolvedValue(true);
    await press();

    expect(native.nativeShare).toHaveBeenCalledOnce();
    // 시트가 열렸으면 주소를 복사하지 않는다 — 두 번 하는 셈이 된다
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('share', { productId: 'p1', method: 'native' });
  });

  it('셸 밖에서 브라우저가 공유를 주면 그것을 쓴다', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await press();

    expect(share).toHaveBeenCalledOnce();
    expect(clipboard.writeText).not.toHaveBeenCalled();
    expect(analytics.track).toHaveBeenCalledWith('share', { productId: 'p1', method: 'web' });
  });

  it('아무것도 없으면 주소를 복사하고 그렇다고 말한다', async () => {
    await press();

    expect(clipboard.writeText).toHaveBeenCalledOnce();
    // 눌렀는데 화면이 그대로면 눌린 줄 모른다
    expect(await screen.findByRole('status')).toHaveTextContent('주소를 복사했습니다.');
    expect(analytics.track).toHaveBeenCalledWith('share', { productId: 'p1', method: 'clipboard' });
  });

  it('공유를 취소해도 오류로 말하지 않는다', async () => {
    /*
     * 시트를 열었다 닫으면 브라우저는 AbortError 를 던진다. 그걸 오류로
     * 보여 주면 사용자는 자기가 뭘 잘못한 줄 안다.
     */
    const share = vi.fn().mockRejectedValue(new DOMException('canceled', 'AbortError'));
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    await press();

    expect(screen.queryByText(/공유하지 못했습니다/)).toBeNull();
    // 취소한 사람에게 복사라도 남겨 준다 — 눌렀는데 아무 일도 없는 것보다 낫다
    expect(clipboard.writeText).toHaveBeenCalledOnce();
  });

  it('복사마저 막히면 무엇을 하라고 말한다', async () => {
    clipboard.writeText.mockRejectedValue(new Error('권한 없음'));
    await press();

    expect(await screen.findByRole('status')).toHaveTextContent(/주소를 직접 복사/);
  });

  it('이름을 그림이 아니라 글자로 갖는다', async () => {
    render(<ShareButton productId="p1" productName="오버사이즈 코트" />);
    // 아이콘만 있는 단추는 낭독기에게 이름이 없다
    expect(screen.getByRole('button', { name: '공유하기' })).toBeInTheDocument();
  });
});
