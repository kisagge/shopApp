// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn<(...a: any[]) => any>() }));

const { WishlistButton } = await import('~/components/wishlist-button');

const setup = (over: Record<string, unknown> = {}) =>
  render(
    <WishlistButton
      productId="p-1"
      productName="울 코트"
      initialWishlisted={false}
      loggedIn
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn<(...a: any[]) => any>(() =>
    Promise.resolve(new Response('{}', { status: 200 }))));
});

describe('이름이 상태를 말한다', () => {
  it('찜하지 않았으면 "찜하기"', () => {
    setup();
    expect(screen.getByRole('button', { name: '울 코트 찜하기' })).toBeDefined();
  });

  it('찜했으면 "찜 해제"', () => {
    // 하트가 찼는지는 눈으로만 보인다. 이름이 상태를 말해야 읽힌다.
    setup({ initialWishlisted: true });
    expect(screen.getByRole('button', { name: '울 코트 찜 해제' })).toBeDefined();
  });

  it('상품명을 포함한다 — 목록에서 어느 상품인지 알아야 한다', () => {
    setup({ productName: '램스울 니트' });
    expect(screen.getByRole('button', { name: /램스울 니트/ })).toBeDefined();
  });

  it('하트 글리프는 접근성 트리에서 감춘다', () => {
    const { container } = setup();
    expect(container.querySelector('[aria-hidden="true"]')?.textContent).toBe('♡');
  });
});

describe('비로그인', () => {
  it('막지 않고 로그인으로 보낸다', async () => {
    // 누르지도 못하게 두면 왜 안 되는지 알 수 없다
    const user = userEvent.setup();
    setup({ loggedIn: false });
    await user.click(screen.getByRole('button'));
    expect(push).toHaveBeenCalledWith(expect.stringContaining('/login?next='));
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('찜하기', () => {
  it('PUT 으로 넣는다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button'));
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('/api/wishlist/p-1');
    expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe('PUT');
  });

  it('찜한 상태에서는 DELETE 로 뺀다', async () => {
    const user = userEvent.setup();
    setup({ initialWishlisted: true });
    await user.click(screen.getByRole('button'));
    expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('누르는 즉시 상태가 바뀐다', async () => {
    const user = userEvent.setup();
    setup();
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: '울 코트 찜 해제' })).toBeDefined();
  });

  it('실패하면 되돌린다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: '찜은 200개까지 담을 수 있습니다' }), { status: 409 }),
    );
    setup();
    await user.click(screen.getByRole('button'));
    // 낙관적으로 바꿨다가 실패했으므로 원래대로
    expect(screen.getByRole('button', { name: '울 코트 찜하기' })).toBeDefined();
  });

  it('네트워크가 끊겨도 되돌린다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    setup({ initialWishlisted: true });
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: '울 코트 찜 해제' })).toBeDefined();
  });
});
