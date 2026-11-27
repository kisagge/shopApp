// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CouponRow } from '~/app/admin/coupons/types';

/**
 * 쿠폰 목록은 **서버가 준 줄만 그린다** — 중지·재개 뒤에는 다시 읽어 온다.
 *
 * 전에는 목록을 상태로 베껴 두고 그 자리만 응답으로 바꿔 끼웠다. 그래서 응답이 들고 오지 않은
 * 칸은 **그 줄에서만** 사라졌고, 다시 불러오면 멀쩡해지니 보고도 믿기 어려웠다 — 이 파일이 그
 * 자리를 지키고 있었다. 그런데 그 거울에는 더 나쁜 면이 있었다: **서버에서만 바뀌는 값은 영원히
 * 낡는다.** 쿠폰을 쥐어 주면 발급 수가 늘지만 표는 계속 `0 / 50` 이었다(coupon-grant-admin 이
 * 그 자리를 밟는다).
 *
 * 거울을 지웠으니 **응답이 칸을 빠뜨려 줄이 비는 고장은 있을 수 없다** — 그릴 것은 서버가 준
 * 목록뿐이다. 그래서 여기서 지키는 것이 바뀐다: 바꾼 뒤에 **다시 읽는지**, 그리고 서버가 준 줄의
 * 대상 칸을 그대로 그리는지.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CouponBoard } = await import('~/app/admin/coupons/coupon-board');

const row = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c-1', code: 'AUTUMN20', name: '가을 쿠폰', kind: 'PERCENT',
  value: 0, percent: 20, maxDiscount: null, minimumOrder: 0,
  issueLimit: null, issuedCount: 0, usedCount: 0,
  startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-09-30T23:59:59+09:00',
  isActive: true, downloadable: false, status: 'ACTIVE', editable: true,
  targetCount: 1, targets: [{ type: 'PRODUCT', name: '울 코트', dead: false }],
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

describe('중지하면', () => {
  it('바뀐 줄을 서버에서 다시 읽는다 — 손에 든 값으로 갈아 끼우지 않는다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ coupon: { ...row(), isActive: false, status: 'INACTIVE' } }),
    );
    const user = userEvent.setup();
    render(<CouponBoard initial={[row()]} brands={[]} categories={[]} />);

    await user.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    // 말은 그 자리에서 한다 — 다시 읽는 동안 아무 말도 없으면 눌렸는지 알 수 없다
    expect(screen.getByText('가을 쿠폰 쿠폰을 중지했습니다. 이미 받은 사람은 계속 쓸 수 있습니다.')).toBeTruthy();
  });

  it('모양이 틀린 200 은 성공으로 보지 않는다', async () => {
    /*
     * 그려 쓰지는 않지만 응답의 모양은 여전히 본다. 창구가 200 과 함께 엉뚱한
     * 몸을 주면(막은 자리를 HTML 로 돌려주는 식) **바뀌지 않았는데 바뀌었다고
     * 말하게 된다** — 그 뒤 다시 읽어도 그대로이니 운영자는 두 번 누른다.
     */
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const user = userEvent.setup();
    render(<CouponBoard initial={[row()]} brands={[]} categories={[]} />);

    await user.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('바꾸지 못했습니다.'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('서버가 준 줄을', () => {
  it('대상 칸까지 그대로 그린다', () => {
    render(<CouponBoard initial={[row()]} brands={[]} categories={[]} />);

    expect(target().textContent).toContain('울 코트');
  });

  /** 상위 분류에 걸린 쿠폰에는 붙는 상품이 없다 — 그 경고가 줄에 보여야 한다 */
  it('붙는 상품이 없다는 경고도 함께 그린다', () => {
    const dead = row({ targets: [{ type: 'CATEGORY', name: '아우터', dead: true }] });
    render(<CouponBoard initial={[dead]} brands={[]} categories={[]} />);

    expect(target().textContent).toContain('붙는 상품 없음');
  });
});
