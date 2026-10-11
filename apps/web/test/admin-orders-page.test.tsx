// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';
import { won, LATE_SHIPPING_DAYS } from '@shop/core';

const requireAdmin = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/guard', () => ({ requireAdmin }));
const getAdminOrders = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/queries/admin/orders')>()),
  getAdminOrders,
}));
vi.mock('@shop/db', () => ({ prisma: {} }));
// 내려받기·일괄 처리는 자기 검사가 있다(order-bulk-actions). 여기서는 목록의 줄만 본다
vi.mock('~/app/admin/orders/order-bulk-actions', () => ({ OrderBulkActions: () => null }));

const Page = (await import('~/app/admin/orders/page')).default;

/**
 * 운영 주문 목록.
 *
 * **출고 직전에 주소가 바뀐 주문을 여기서 알아봐야 한다.** 처리 이력에 줄은 남지만 그것은 주문을 열어야
 * 보이고, 피킹 목록을 이미 뽑았거나 송장을 붙이려던 사람은 열어 볼 이유가 없다 — 옛 주소로 보내고 나서야
 * 안다. 판단은 core 가 하고(showsAddressChanged) 목록은 그 값을 그린다.
 */

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };

const row = (over: Record<string, unknown> = {}) => ({
  orderNo: '20260930-0000001',
  status: 'PREPARING' as const,
  placedAt: new Date('2026-09-30T01:00:00Z'),
  paidAt: new Date('2026-09-30T01:00:00Z'),
  amount: won(100_000),
  buyerName: '장○○',
  itemCount: 1,
  firstItemName: '코튼 케이블 크루넥',
  addressChanged: false,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(admin);
  getAdminOrders.mockResolvedValue({ rows: [row()], total: 1 });
});

const renderPage = async (params: Record<string, string> = {}) =>
  render(await Page({ searchParams: Promise.resolve(params) }));

describe('주문 목록', () => {
  it('주문 한 줄을 그린다 — 못 그리면 아래가 전부 헛돈다', async () => {
    await renderPage();

    const line = screen.getByRole('row', { name: /20260930-0000001/ });
    expect(within(line).getByRole('link', { name: '20260930-0000001' })).toBeInTheDocument();
    expect(within(line).getByText('코튼 케이블 크루넥')).toBeInTheDocument();
    // 상태 거르기 링크에도 같은 말이 있다 — 줄 안에서 본다
    expect(within(line).getByText('배송준비')).toBeInTheDocument();
  });

  it('배송지가 바뀐 주문을 그 줄에서 알려 준다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [row({ addressChanged: true })], total: 1 });
    await renderPage();

    const line = screen.getByRole('row', { name: /20260930-0000001/ });
    expect(within(line).getByText('배송지 변경')).toBeInTheDocument();
    // 상태는 그대로 보인다 — 새 표시가 원래 있던 것을 덮지 않는다
    expect(within(line).getByText('배송준비')).toBeInTheDocument();
  });

  /** 색으로만 말하면 색을 못 보는 사람에게는 아무 표시가 없는 것과 같다 */
  it('표시는 글자로 한다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [row({ addressChanged: true })], total: 1 });
    await renderPage();

    expect(screen.getByText('배송지 변경').textContent).toBe('배송지 변경');
  });

  it('바뀐 적이 없으면 아무 표시도 없다 — 늘 붙어 있으면 아무도 안 본다', async () => {
    await renderPage();

    expect(screen.queryByText('배송지 변경')).toBeNull();
  });
});

/**
 * **어느 쪽으로 세웠는지 말해 준다.**
 *
 * 아무 말 없이 순서만 바뀌면 사람은 목록이 뒤집힌 줄 모르고 맨 위를 "가장 새 주문" 으로 읽는다 —
 * 그 오해는 오래된 주문을 또 뒤로 민다.
 */
describe('목록을 세운 방향을 말한다', () => {
  it('처리할 일이 남은 탭에서는 그 사실을 적는다', async () => {
    await renderPage({ status: 'PREPARING' });

    expect(screen.getByText(/오래 기다린 주문부터/)).toBeDefined();
  });

  it('보낸 뒤의 탭에서는 적지 않는다 — 거기는 최신순이 맞다', async () => {
    await renderPage({ status: 'DELIVERED' });

    expect(screen.queryByText(/오래 기다린 주문부터/)).toBeNull();
  });

  it('전체 탭에서도 적지 않는다', async () => {
    await renderPage();

    expect(screen.queryByText(/오래 기다린 주문부터/)).toBeNull();
  });
});

/**
 * **기다린 날 — 그리고 시계가 둘이다.**
 *
 * 오래 기다린 것부터 세우게 만들었어도 목록에는 접수 날짜만 있었다. 사흘 밀린 주문과 오늘 주문이
 * 같은 무게로 보이고, 날짜를 읽고 오늘 날짜를 떠올려 빼는 일은 바쁜 날 아무도 하지 않는다.
 *
 * 손님이 기다린 날은 **주문한 날**부터 세고, 늦었다는 말은 **입금을 확인한 날**부터 센다 —
 * 무통장 주문은 둘이 며칠씩 벌어진다. 판단은 core 가 하고(waitingDays·shipmentLate) 목록은 적는다.
 */
describe('며칠 기다렸는지 적는다', () => {
  const dayMs = 24 * 60 * 60 * 1000;
  const daysAgo = (n: number) => new Date(Date.now() - n * dayMs);
  const line = () => screen.getByRole('row', { name: /20260930-0000001/ });
  const show = async (over: Record<string, unknown>, params: Record<string, string> = {}) => {
    getAdminOrders.mockResolvedValue({ rows: [row(over)], total: 1 });
    await renderPage(params);
  };

  describe('기다린 날은 주문한 날부터 센다', () => {
    it('사흘 전 주문은 "3일 기다림"', async () => {
      await show({ status: 'PREPARING', placedAt: daysAgo(3), paidAt: daysAgo(3) }, { status: 'PREPARING' });

      expect(within(line()).getByText(/3일 기다림/)).toBeInTheDocument();
    });

    it('오늘 들어온 주문은 "오늘 접수" 다 — 0일이라고 적지 않는다', async () => {
      await show({ status: 'PAID', placedAt: new Date(), paidAt: new Date() }, { status: 'PAID' });

      expect(within(line()).getByText('오늘 접수')).toBeInTheDocument();
    });

    it('주문일은 그대로 있다 — 새 표시가 원래 있던 것을 덮지 않는다', async () => {
      await show({ status: 'PREPARING', placedAt: daysAgo(3), paidAt: daysAgo(3) }, { status: 'PREPARING' });

      expect(within(line()).getByText(daysAgo(3).toLocaleDateString('ko-KR'))).toBeInTheDocument();
    });

    it('이미 보낸 주문에는 적지 않는다 — 늘 붙어 있으면 아무도 안 본다', async () => {
      await show({ status: 'DELIVERED', placedAt: daysAgo(9), paidAt: daysAgo(9) }, { status: 'DELIVERED' });

      expect(within(line()).queryByText(/기다림/)).toBeNull();
      expect(within(line()).getByText(daysAgo(9).toLocaleDateString('ko-KR'))).toBeInTheDocument();
    });
  });

  describe('늦었다는 말은 입금한 날부터 센다', () => {
    /** 색으로만 말하면 색을 못 보는 사람에게는 아무 표시가 없는 것과 같다 */
    it('늦은 줄은 글자로 늦었다고 적는다', async () => {
      await show({ status: 'PAID', placedAt: daysAgo(4), paidAt: daysAgo(4) }, { status: 'PAID' });

      expect(within(line()).getByText(/4일 기다림 · 늦음/)).toBeInTheDocument();
    });

    it('하루 지난 주문은 아직 늦지 않았다', async () => {
      await show({ status: 'PAID', placedAt: daysAgo(1), paidAt: daysAgo(1) }, { status: 'PAID' });

      expect(within(line()).getByText('1일 기다림')).toBeInTheDocument();
    });

    /**
     * **무통장 주문이 닷새 뒤에 입금되면 우리 차례는 그날 시작한다.** 한 시계로 세면 입금을
     * 확인하는 순간 이미 늦은 줄이 되어, 방금 들어온 일이 지각으로 보인다.
     */
    it('닷새 기다렸어도 오늘 입금됐으면 늦지 않았다', async () => {
      await show({ status: 'PAID', placedAt: daysAgo(5), paidAt: new Date() }, { status: 'PAID' });

      // 손님이 기다린 날은 그대로 적는다
      expect(within(line()).getByText('5일 기다림')).toBeInTheDocument();
      expect(within(line()).queryByText(/늦음/)).toBeNull();
    });

    /** 입금 대기는 손님을 기다리는 중이다 — 거기에 빨간 줄을 그으면 정작 늦은 줄이 묻힌다 */
    it('입금 대기는 오래 기다려도 늦었다고 하지 않는다', async () => {
      await show({ status: 'PENDING', placedAt: daysAgo(10), paidAt: null }, { status: 'PENDING' });

      expect(within(line()).getByText('10일 기다림')).toBeInTheDocument();
      expect(within(line()).queryByText(/늦음/)).toBeNull();
    });
  });

  /** 장부에서도 늦은 줄은 눈에 띄어야 한다 — 전체 탭은 순서만 최신순이다 */
  it('전체 탭에서도 안 보낸 줄에는 적는다', async () => {
    await show({ status: 'PREPARING', placedAt: daysAgo(5), paidAt: daysAgo(5) });

    expect(within(line()).getByText(/5일 기다림 · 늦음/)).toBeInTheDocument();
  });
});

/**
 * **늦은 주문만 보는 중.**
 *
 * 대시보드에서 눌러 들어오면 목록이 좁혀진 채로 열린다 — 그 말이 없으면 "주문이 셋뿐" 으로 읽히고,
 * 빈 표는 "주문이 없다" 로 읽힌다(늦은 주문이 없는 것은 좋은 소식이다).
 */
describe('발송 늦은 주문만 보기', () => {
  it('조회에 조건을 넘긴다', async () => {
    await renderPage({ late: '1' });

    expect(getAdminOrders.mock.calls[0]![1]).toMatchObject({ lateShipping: true });
  });

  it('무엇만 보는 중인지 말하고, 돌아갈 길을 준다', async () => {
    await renderPage({ late: '1' });

    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain(`입금 후 ${LATE_SHIPPING_DAYS}일`);
    expect(within(notice).getByRole('link', { name: '전체 주문 보기' }).getAttribute('href'))
      .toBe('/admin/orders');
  });

  /** 쪽을 넘기는 순간 조건이 풀리면 둘째 쪽은 전체 주문이 된다 */
  it('쪽을 넘겨도 조건이 남는다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [row()], total: 100 });

    await renderPage({ late: '1' });

    const next = screen.getByRole('link', { name: /다음/ });
    expect(next.getAttribute('href')).toContain('late=1');
  });

  it('늦은 주문이 없으면 그렇게 말한다 — "주문이 없습니다" 가 아니다', async () => {
    getAdminOrders.mockResolvedValue({ rows: [], total: 0 });

    await renderPage({ late: '1' });

    expect(screen.getByText('발송이 늦은 주문이 없습니다.')).toBeInTheDocument();
  });

  it('조건을 안 걸면 안내도 없다', async () => {
    await renderPage();

    expect(screen.queryByText(/입금 후/)).toBeNull();
  });
});
