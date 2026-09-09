// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => void>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { RestockButton } = await import('~/components/restock-button');

const base = { variantId: 'v1', optionLabel: '오트 / M', subscribed: false, loggedIn: true };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
});
afterEach(() => vi.unstubAllGlobals());

/**
 * 품절 화면에서 할 수 있는 유일한 동작이다. 여기가 조용히 실패하면 사람은
 * 눌렀는지도 모른 채 떠나고, 우리는 재입고를 기다리는 수요를 통째로 잃는다.
 */
describe('재입고 알림 버튼', () => {
  it('비로그인이면 서버를 부르지 않고 로그인으로 보낸다', async () => {
    // 알림은 계정에 매이는 기능이라 로그인이 자연스러운 다음 걸음이다.
    render(<RestockButton {...base} loggedIn={false} />);
    await userEvent.click(screen.getByRole('button'));

    expect(fetch).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledTimes(1);
    // 돌아올 자리를 들려 보낸다 — 로그인 뒤 홈으로 떨어뜨리면 다시 찾아와야 한다
    expect(String(push.mock.calls[0]![0])).toContain('/login?next=');
  });

  it('신청과 취소가 서로 다른 방법으로 나간다', async () => {
    const { unmount } = render(<RestockButton {...base} />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ method: 'PUT' });
    unmount();

    vi.mocked(fetch).mockClear();
    render(<RestockButton {...base} subscribed />);
    await userEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(vi.mocked(fetch).mock.calls[0]![1]).toMatchObject({ method: 'DELETE' });
  });

  it('이름표가 색이 아니라 말로 지금 무엇이 되는지 알린다', async () => {
    // 낭독기는 버튼 색을 못 본다. 이름에 옵션까지 들어가야 어느 옵션의
    // 알림인지 알 수 있다 — 한 화면에 여러 옵션이 있다.
    render(<RestockButton {...base} />);
    const before = screen.getByRole('button').getAttribute('aria-label');
    expect(before).toContain('오트 / M');

    await userEvent.click(screen.getByRole('button'));
    await waitFor(() =>
      expect(screen.getByRole('button').getAttribute('aria-label')).not.toBe(before),
    );
  });

  it('서버가 거절하면 그 이유를 그대로 보여 준다', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ message: '이미 신청한 옵션입니다.' }), { status: 409 }),
    );
    render(<RestockButton {...base} />);
    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(screen.getByText('이미 신청한 옵션입니다.')).toBeInTheDocument());
  });

  it('네트워크가 끊겨도 조용히 넘어가지 않는다', async () => {
    // 아무 말이 없으면 눌렀는지 알 수 없다. 그게 이 화면에서 가장 나쁜 결말이다.
    vi.mocked(fetch).mockRejectedValueOnce(new Error('offline'));
    render(<RestockButton {...base} />);
    await userEvent.click(screen.getByRole('button'));

    const live = document.querySelector('[aria-live="polite"]');
    await waitFor(() => expect(live?.textContent?.trim()).not.toBe(''));
  });
});
