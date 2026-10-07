// @vitest-environment jsdom
import { render, screen, within, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 운영 알림함 — **열었다고 할 일이 끝나지는 않는다.**
 *
 * 여기에는 할 일(반품 신청·문의·입점 신청·재고)과 소식(검수 결과·정산)이 섞여 있다. 한 번 열면 안 읽은
 * 것이 전부 읽음이 되던 때에는 뱃지의 숫자가 "할 일이 몇 개" 가 아니라 "들여다봤는가" 가 됐고, 아직
 * 처리하지 않은 일은 목록을 훑어 기억하는 수밖에 없었다 — 코드가 끝난 일을 닫아 주는 것과 짝이 되려면
 * 사람도 자기 손으로 닫을 수 있어야 한다.
 *
 * **소식은 열면 읽힌다.** 아무도 닫을 일이 아니라서 남겨 두면 영영 쌓인다 — 어느 종류가 소식인지는
 * 서버가 정하고(core), 화면이 하는 일은 안 읽은 소식이 있을 때 그 창구를 한 번 부르는 것뿐이다.
 */

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getMyNotifications = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const countUnread = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/notifications')>()),
  getMyNotifications,
  countUnread,
}));
const getNotificationTemplates = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/templates', () => ({ getNotificationTemplates }));
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  useRouter: () => ({ refresh, push: vi.fn(), back: vi.fn() }),
}));
vi.mock('@shop/db', () => ({ prisma: {} }));

const Page = (await import('~/app/admin/notifications/page')).default;

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const notice = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'RETURN_REQUESTED' as const,
  params: { orderNo: '20261007-0000001' },
  linkPath: '/admin/orders/20261007-0000001',
  unread: true,
  createdAt: new Date('2026-10-07T01:00:00Z'),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getNotificationTemplates.mockResolvedValue(new Map());
  getMyNotifications.mockResolvedValue({ rows: [notice()], total: 1 });
  countUnread.mockResolvedValue(1);
  vi.stubGlobal('fetch', vi.fn<(...a: any[]) => any>(async () => new Response('{"marked":1}', { status: 200 })));
});

const renderPage = async (params: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(params) }));
const sent = () => {
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, { body: string }];
  return { url, body: JSON.parse(init.body) as { ids: string[] } };
};

describe('열었다고 할 일이 끝나지는 않는다', () => {
  /**
   * **여기가 이 묶음의 요점이다.** 할 일까지 자동으로 읽히면 그 아래 단추들은 아무 뜻이 없다 — 화면이
   * 뜨는 순간 이미 전부 읽음이기 때문이다.
   */
  it('할 일만 안 읽음이면 읽음 창구를 부르지 않는다', async () => {
    await renderPage();

    await waitFor(() => expect(screen.getByRole('list')).toBeDefined());
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 소식은 아무도 "닫을" 일이 아니라서 남겨 두면 영영 쌓인다 — 열어 본 것으로 끝이다 */
  it('안 읽은 소식이 있으면 창구를 한 번 부른다 — 줄을 고르지 않는다', async () => {
    getMyNotifications.mockResolvedValue({
      rows: [notice({ id: 'n-news', kind: 'SETTLEMENT_PAID', params: { period: '2026-09', amount: '1,284,000' } })],
      total: 1,
    });

    await renderPage();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit | undefined];
    expect(url).toBe('/api/notifications/read?box=console');
    // 종류를 화면이 적어 보내지 않는다 — 어느 쪽이 소식인지는 서버가 정한다
    expect(init?.body).toBeUndefined();
  });

  it('안 읽은 줄에는 닫는 단추가 선다', async () => {
    await renderPage();

    // 무엇을 닫는지 이름에 담는다 — "읽음, 단추" 가 열 번 읽히면 어느 줄인지 알 수 없다
    expect(screen.getByRole('button', { name: /반품.*읽음 처리/ })).toBeDefined();
  });

  it('이미 읽은 줄에는 단추가 없다 — 되돌리는 동작이 아니다', async () => {
    getMyNotifications.mockResolvedValue({ rows: [notice({ unread: false })], total: 1 });

    await renderPage();

    expect(screen.queryByRole('button', { name: /반품.*읽음 처리/ })).toBeNull();
  });
});

describe('사람이 끝낸 줄을 닫는다', () => {
  it('그 줄의 id 만 보낸다', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: /반품.*읽음 처리/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(sent().url).toBe('/api/notifications/read?box=console');
    expect(sent().body.ids).toEqual(['n-1']);
  });

  it('닫은 뒤 목록을 다시 받는다 — 점과 뱃지가 함께 바뀌어야 한다', async () => {
    await renderPage();

    await userEvent.click(screen.getByRole('button', { name: /반품.*읽음 처리/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  /** 조용히 아무 일도 안 일어나면 사람은 이 단추가 원래 그런 줄 안다 */
  it('못 닫으면 그 자리에 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn<(...a: any[]) => any>(async () => new Response('', { status: 500 })));

    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: /반품.*읽음 처리/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('처리하지 못했습니다'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('모두 읽음', () => {
  it('이 쪽에 보이는 안 읽은 줄만 보낸다', async () => {
    getMyNotifications.mockResolvedValue({
      rows: [notice(), notice({ id: 'n-2' }), notice({ id: 'n-3', unread: false })],
      total: 3,
    });

    await renderPage();
    await userEvent.click(screen.getByRole('button', { name: /모두 읽음 처리/ }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    /*
     * **"모두" 가 안 보이는 뒤쪽까지 뜻하면 안 된다.** 서른한 번째 할 일이 읽은 적도 없이 사라진다 —
     * 읽음은 되돌릴 수 없다.
     */
    expect(sent().body.ids).toEqual(['n-1', 'n-2']);
  });

  it('안 읽은 것이 없으면 그리지 않는다', async () => {
    getMyNotifications.mockResolvedValue({ rows: [notice({ unread: false })], total: 1 });

    await renderPage();

    expect(screen.queryByRole('button', { name: /모두 읽음/ })).toBeNull();
  });

  it('알림이 하나도 없으면 그릴 것도 없다', async () => {
    getMyNotifications.mockResolvedValue({ rows: [], total: 0 });

    await renderPage();

    expect(screen.getByText('새 알림이 없습니다.')).toBeDefined();
    expect(screen.queryByRole('button', { name: /읽음/ })).toBeNull();
  });
});

describe('할 일을 보러 가는 것과 닫는 것은 다른 동작이다', () => {
  it('닫는 단추가 링크 안에 들어 있지 않다', async () => {
    await renderPage();

    const link = screen.getByRole('link', { name: /반품/ });
    expect(within(link).queryByRole('button')).toBeNull();
  });
});

/**
 * **읽은 줄 사이에서 남은 일을 찾을 길.**
 *
 * 이 알림함은 열어도 할 일이 읽음이 되지 않는다. 그래서 끝난 것과 지나간 소식이 쌓이는 사이에 남은
 * 일이 묻힌다 — 머리의 뱃지는 "셋 남았다" 고 하는데 목록에서 그 셋을 찾으려면 서른 줄을 훑어야 했다.
 */
describe('안 읽은 것만 보기', () => {
  const tabs = () => screen.getByRole('navigation', { name: '알림 보기' });

  it('기본은 전체다', async () => {
    await renderPage();

    expect(within(tabs()).getByRole('link', { name: '전체' })).toHaveProperty('ariaCurrent', 'page');
    expect(getMyNotifications.mock.calls[0]![3]).toBe(false);
  });

  it('안 읽음 탭은 안 읽은 것만 받아 온다', async () => {
    await renderPage({ unread: '1' });

    expect(getMyNotifications.mock.calls[0]![3]).toBe(true);
    expect(within(tabs()).getByRole('link', { name: /안 읽음/ })).toHaveProperty('ariaCurrent', 'page');
  });

  /** 뱃지는 3 인데 들어가면 2 건인 날이 오면, 그 뱃지를 믿지 않게 된다 */
  it('탭의 수는 머리의 뱃지와 같은 함수에서 온다', async () => {
    countUnread.mockResolvedValue(3);

    await renderPage();

    expect(within(tabs()).getByRole('link', { name: /안 읽음\s*3/ })).toBeDefined();
    expect(countUnread).toHaveBeenCalledWith('u-admin', 'console');
  });

  it('남은 일이 없으면 수를 달지 않는다', async () => {
    countUnread.mockResolvedValue(0);

    await renderPage();

    expect(within(tabs()).getByRole('link', { name: /^안 읽음$/ })).toBeDefined();
  });

  it('안 읽음 탭이 비면 남은 일이 없다고 말한다', async () => {
    getMyNotifications.mockResolvedValue({ rows: [], total: 0 });

    await renderPage({ unread: '1' });

    expect(screen.getByText(/남은 할 일이 없다는 뜻입니다/)).toBeDefined();
  });

  /** 빠뜨리면 쪽을 넘기는 순간 조건이 풀린다 — 상품 목록에서 이미 겪은 자리다 */
  it('쪽을 넘겨도 필터가 유지된다', async () => {
    getMyNotifications.mockResolvedValue({ rows: [notice()], total: 60 });

    await renderPage({ unread: '1' });

    const next = screen.getByRole('link', { name: /다음/ });
    expect(next.getAttribute('href')).toContain('unread=1');
    expect(next.getAttribute('href')).toContain('page=2');
  });

  it('모르는 값은 필터로 쓰지 않는다', async () => {
    await renderPage({ unread: '어쩌구' });

    expect(getMyNotifications.mock.calls[0]![3]).toBe(false);
  });
});
