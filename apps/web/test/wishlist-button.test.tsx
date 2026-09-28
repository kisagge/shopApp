// @vitest-environment jsdom
import { render, screen, cleanup } from './render';
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

  it('하트는 그림이고, 접근성 트리에서 감춘다', () => {
    /*
     * **글자가 아니라 그림이다.** 예전에는 ♥ 와 ♡ 두 문자를 켜고 껐는데, 그 둘은 서로 다른 글자라 기기마다
     * 다른 폰트에서 온다 — 안드로이드는 찬 하트를 컬러 이모지로 그려서 앱에서 켠 것과 끈 것의 크기·굵기가
     * 달라 보였다(PC 는 둘 다 같은 폰트라 티가 안 났다).
     */
    const { container } = setup();
    const icon = container.querySelector('svg');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');
    expect(container.textContent).not.toContain('♡');
  });

  it('켠 것과 끈 것이 같은 모양이다 — 채우기만 다르다', () => {
    const off = setup().container.querySelector('svg');
    cleanup();
    const on = setup({ initialWishlisted: true }).container.querySelector('svg');

    expect(on?.querySelector('path')?.getAttribute('d')).toBe(
      off?.querySelector('path')?.getAttribute('d'),
    );
    expect(on?.getAttribute('viewBox')).toBe(off?.getAttribute('viewBox'));
    expect(off?.getAttribute('fill')).toBe('none');
    expect(on?.getAttribute('fill')).toBe('currentColor');
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

  /**
   * **까닭이 낭독기에만 들렸다.** 낙관적으로 칠한 하트를 실패 때 되돌리는데 이유는 sr-only 에만 있어서,
   * 눈으로 보는 사람에게는 **하트가 깜빡이고 원래대로 돌아간 것**이 전부였다 — 로그인이 풀렸는지, 망이
   * 끊겼는지, 다시 누르면 되는지 알 방법이 없다.
   */
  it('실패한 까닭을 눈에도 보이게 적는다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ message: '찜은 200개까지 담을 수 있습니다' }), { status: 409 }),
    );
    setup();

    await user.click(screen.getByRole('button'));

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('200개까지');
    expect(alert.className, 'sr-only 로 숨겨 두면 보고 있는 사람은 모른다').not.toContain('sr-only');
  });

  it('보내는 중에 다시 눌러도 한 번만 보낸다', async () => {
    const user = userEvent.setup();
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    vi.mocked(fetch).mockImplementation(async () => {
      await held;
      return new Response('{}', { status: 200 });
    });
    setup();

    const button = screen.getByRole('button');
    await user.click(button);
    await user.click(button);

    // 단추는 aria-disabled 만 걸린다(초점을 받아야 이유가 들린다) — 두 번 보내는 것은 핸들러가 막는다
    expect(fetch).toHaveBeenCalledTimes(1);
    release();
  });

  it('네트워크가 끊겨도 되돌린다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    setup({ initialWishlisted: true });
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button', { name: '울 코트 찜 해제' })).toBeDefined();
  });
});
