// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CouponRow } from '~/app/admin/coupons/types';

/**
 * 쿠폰 목록은 **서버가 돌려준 줄을 그대로 세운다** — 중지·재개 뒤에도, 만든 직후에도.
 *
 * 목록을 다시 읽지 않고 그 자리만 바꿔 끼우기 때문에, 응답이 들고 오지 않은 칸은 **그 줄에서만**
 * 사라진다. 다시 불러오면 멀쩡해지니 보고도 믿기 어렵다. 대상 칸을 새로 적게 되었으니 세 자리
 * (목록·만들기·고치기)가 같은 모양을 내놓는지 여기서 한 번 더 못 박는다.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const { CouponBoard } = await import('~/app/admin/coupons/coupon-board');

const row = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c-1', code: 'AUTUMN20', name: '가을 쿠폰', kind: 'PERCENT',
  value: 0, percent: 20, maxDiscount: null, minimumOrder: 0,
  issueLimit: null, issuedCount: 0, usedCount: 0,
  startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-09-30T23:59:59+09:00',
  isActive: true, downloadable: false, status: 'ACTIVE', editable: true,
  targetCount: 1, targetNames: ['울 코트'], deadTargets: false,
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

/** 대상 칸 — 줄 머리(쿠폰)·할인·최소 주문 다음 */
const target = () =>
  within(screen.getByRole('row', { name: /가을 쿠폰/ })).getAllByRole('cell')[2]!;

describe('중지한 뒤에도', () => {
  it('대상 칸이 비지 않는다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ coupon: { ...row(), isActive: false, status: 'INACTIVE' } }),
    );
    const user = userEvent.setup();
    render(<CouponBoard initial={[row()]} brands={[]} categories={[]} />);

    await user.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 재개' })).toBeInTheDocument());
    expect(target().textContent).toContain('울 코트');
  });

  /** 상위 분류에 걸린 쿠폰은 중지해도 여전히 상위 분류에 걸려 있다 — 경고가 따라가야 한다 */
  it('붙는 상품이 없다는 경고도 따라간다', async () => {
    const dead = row({ targetNames: ['아우터'], deadTargets: true });
    fetchMock.mockResolvedValue(
      Response.json({ coupon: { ...dead, isActive: false, status: 'INACTIVE' } }),
    );
    const user = userEvent.setup();
    render(<CouponBoard initial={[dead]} brands={[]} categories={[]} />);

    await user.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 재개' })).toBeInTheDocument());
    expect(target().textContent).toContain('붙는 상품 없음');
  });
});
