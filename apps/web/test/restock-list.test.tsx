// @vitest-environment jsdom
import { render, screen, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
  // AppLink 가 이 훅을 쓴다 — 흉내에 없으면 링크를 그리는 순간 터진다(link-mock 검사가 지킨다)
  useLinkStatus: () => ({ pending: false }),
}));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { RestockList } = await import('~/components/restock-list');

/**
 * 걸어 둔 재입고 알림 목록.
 *
 * **지우기가 실패하면 아무 말도 안 했다.** 실패 문구가 sr-only 한 곳에만 있어서, 눈으로 보는 사람에게는
 * 단추를 눌렀는데 줄이 그대로 남아 있을 뿐이었다. 성공 알림도 문제였다 — 줄마다 알림 자리를 두고 글을
 * 채운 뒤 목록을 다시 그렸으므로, 방금 글을 채운 요소가 새 목록에는 없었다.
 */

const row = (n: number) => ({
  variantId: `v-${n}`,
  optionLabel: '오트 / M',
  productName: `울 코트 ${n}`,
  productSlug: `wool-coat-${n}`,
  brandName: 'STUDIO NOON',
  inStock: false,
  notified: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('지우기', () => {
  it('그 옵션의 알림만 지운다', async () => {
    const user = userEvent.setup();
    render(<RestockList rows={[row(1), row(2)]} />);

    await user.click(screen.getByRole('button', { name: '울 코트 1 재입고 알림 삭제' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/restock/v-1', { method: 'DELETE' });
    expect(refresh).toHaveBeenCalled();
  });

  it('지웠다고 알린다 — 줄이 사라지는 것은 눈으로만 보이는 변화다', async () => {
    const user = userEvent.setup();
    const { container } = render(<RestockList rows={[row(1)]} />);

    await user.click(screen.getByRole('button', { name: /울 코트 1/ }));

    const live = container.querySelector('[aria-live="polite"]');
    expect(live?.textContent).toContain('울 코트 1');
  });

  /**
   * **알림 자리는 목록 바깥에 둔다.** 줄 안에 두면 성공한 순간 그 줄이 사라지면서 방금 채운 글도 함께
   * 사라진다 — 낭독기가 읽을 것이 없다.
   */
  it('알림 자리는 목록 안에 있지 않다', () => {
    const { container } = render(<RestockList rows={[row(1)]} />);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(within(screen.getByRole('list')).queryByText('', { selector: '[aria-live]' })).toBeNull();
  });

  /**
   * **실패는 눈에도 보이게.** 낭독기에만 들리면 보고 있는 사람에게는 단추를 눌렀는데 줄이 그대로 남은
   * 것이 전부다 — 왜 안 됐는지도, 다시 누르면 되는지도 알 수 없다.
   */
  it('실패하면 보이는 자리에 적는다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    render(<RestockList rows={[row(1)]} />);

    await user.click(screen.getByRole('button', { name: /울 코트 1/ }));

    const alert = screen.getByRole('alert');
    expect(alert.className, 'sr-only 로 숨겨 두면 보고 있는 사람은 모른다').not.toContain('sr-only');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('망이 끊겨도 그 자리에서 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<RestockList rows={[row(1)]} />);

    await user.click(screen.getByRole('button', { name: /울 코트 1/ }));

    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('보내는 중에 다시 눌러도 한 번만 보낸다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation(async () => {
      await held;
      return new Response('{}', { status: 200 });
    });
    render(<RestockList rows={[row(1)]} />);

    const button = screen.getByRole('button', { name: /울 코트 1/ });
    await user.click(button);
    await user.click(button);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
  });

  it('어느 줄의 삭제인지 이름에 적는다 — "삭제" 만 있으면 알 수 없다', () => {
    render(<RestockList rows={[row(1), row(2)]} />);

    expect(screen.getByRole('button', { name: '울 코트 1 재입고 알림 삭제' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '울 코트 2 재입고 알림 삭제' })).toBeTruthy();
  });
});
