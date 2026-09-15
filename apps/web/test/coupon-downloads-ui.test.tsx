// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { CouponDownloads } = await import('~/components/coupon-downloads');

/** 받기 단추 — 받으면 같은 자리에 "받음" 이 남아 초점이 튀지 않고, 결과를 알리고, 로그인 안 했으면 로그인하러 */

const COUPON = {
  id: 'c-1', name: '가을 20%', kind: 'PERCENT', value: 0, percent: 20, maxDiscount: 30_000, minimumOrder: 50_000,
  endsAt: '2026-09-30T14:59:59.000Z', limited: true, remaining: 60, claimed: false,
};

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const setup = (props: Partial<Parameters<typeof CouponDownloads>[0]> = {}) => {
  const user = userEvent.setup();
  render(
    <>
      <h2 id="h">쿠폰</h2>
      <CouponDownloads coupons={[COUPON]} loggedIn returnTo="/product/wool-coat" headingId="h" {...props} />
    </>,
  );
  return user;
};

describe('쿠폰 받기 목록', () => {
  it('할인·조건(최소 금액·일부 상품·남은 수량·기한)을 적는다', () => {
    setup();
    const list = screen.getByRole('list', { name: '쿠폰' });
    expect(list).toHaveTextContent('20% 할인 (최대 30,000원)');
    expect(list).toHaveTextContent(/50,000원 이상 · 일부 상품 · 남은 60장 · 2026. 9. 30. 까지/);
  });

  it('받으면 같은 단추가 "받음" 으로 남아 초점을 쥐고, 결과를 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'AUTUMN20' }, { status: 201 }));
    const user = setup();
    const button = screen.getByRole('button', { name: '가을 20% 쿠폰 받기' });
    await user.click(button);
    await waitFor(() => expect(screen.getByRole('button', { name: '가을 20% 쿠폰 받음' })).toHaveFocus());
    expect(screen.getByRole('button', { name: '가을 20% 쿠폰 받음' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('가을 20%을(를) 받았습니다. 결제할 때 고를 수 있습니다.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/coupons/c-1/download', { method: 'POST' });

    // 받은 뒤 다시 눌러도 보내지 않는다
    await user.click(screen.getByRole('button', { name: '가을 20% 쿠폰 받음' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('이미 받았다고 하면 받은 것으로 맞추고 이유를 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'ALREADY_ISSUED', message: '이미 받은 쿠폰입니다.' }, { status: 409 }));
    const user = setup();
    await user.click(screen.getByRole('button', { name: '가을 20% 쿠폰 받기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('이미 받은 쿠폰입니다.'));
    expect(screen.getByRole('button', { name: '가을 20% 쿠폰 받음' })).toBeInTheDocument();
  });

  it('소진이면 이유만 알리고 받기 단추로 남는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'EXHAUSTED', message: '준비된 수량이 모두 소진됐습니다.' }, { status: 409 }));
    const user = setup();
    await user.click(screen.getByRole('button', { name: '가을 20% 쿠폰 받기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('소진'));
    expect(screen.getByRole('button', { name: '가을 20% 쿠폰 받기' })).toBeInTheDocument();
  });

  it('로그인하지 않았으면 돌아올 곳을 단 로그인 링크', () => {
    setup({ loggedIn: false });
    expect(screen.getByRole('link', { name: '로그인하고 받기' })).toHaveAttribute('href', '/login?next=%2Fproduct%2Fwool-coat');
    expect(screen.queryByRole('button')).toBeNull();
  });
});
