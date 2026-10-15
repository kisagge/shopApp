// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CouponGrant } from '~/app/admin/coupons/coupon-grant';
import type { CouponRow } from '~/app/admin/coupons/types';

/**
 * 쿠폰 지급 — **누구에게 돈을 주는지 정하는 자리.**
 *
 * 검사가 한 줄도 없었다. 둘이 있었다.
 *
 * **하나, 고른 사람을 수로만 적었다.** 검색 결과는 다음 검색에 통째로 갈리므로, 둘을 고르고
 * 다시 찾는 순간 **앞서 고른 사람이 화면에서 사라지고 "3명" 만 남는다.** 쿠폰이 누구에게
 * 가는지 확인할 방법이 없는 셈이다.
 *
 * **둘, 찾기가 셋을 똑같은 침묵으로 답했다** — 없을 때, 거절당할 때, 길이 끊길 때. 쿠폰 폼의
 * 상품 찾기와 같은 자리였다.
 */

const coupon = {
  id: 'c-1', code: 'WELCOME10', name: '웰컴 10%', kind: 'PERCENT',
  value: 0, percent: 10, maxDiscount: null, minimumOrder: 0,
  issueLimit: 100, issuedCount: 12, usedCount: 0,
  startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z',
  isActive: true, downloadable: true, status: 'ACTIVE', editable: true,
  targetCount: 0, targets: [],
} satisfies CouponRow;

const handlers = () => ({ onDone: vi.fn(), onClose: vi.fn() });

const open = () => {
  const h = handlers();
  render(<CouponGrant coupon={coupon} {...h} />);
  return h;
};

const users = (...rows: [string, string, string][]) =>
  vi.fn(async () => new Response(
    JSON.stringify({ users: rows.map(([id, name, email]) => ({ id, name, email })) }),
    { status: 200 },
  ));

const search = async (term: string) => {
  const box = screen.getByLabelText(/회원 검색/);
  await userEvent.clear(box);
  await userEvent.type(box, term);
  await userEvent.click(screen.getByRole('button', { name: '찾기' }));
};

const pickedList = () => screen.getByRole('list', { name: '지급할 회원' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', users(['u-1', '장보영', 'a@plain.test']));
});

describe('회원 찾기', () => {
  it('적은 말로 찾는다', async () => {
    open();

    await search('장보영');

    expect(await screen.findByLabelText(/장보영/)).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/admin/users/search?q='));
  });

  /** 창구를 열자마자 전체 명단이 뜨면 고르는 화면이 아니라 명단을 훑는 화면이 된다 */
  it('빈 말로는 찾지 않는다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '찾기' }));

    expect(fetch).not.toHaveBeenCalled();
  });

  it('찾았는데 없으면 없다고 말한다', async () => {
    vi.stubGlobal('fetch', users());
    open();

    expect(screen.queryByText(/찾은 회원이 없습니다/)).toBeNull();
    await search('없는이름');

    expect(await screen.findByText(/찾은 회원이 없습니다/)).toBeDefined();
  });

  it('서버가 거절하면 그 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: '검색어가 너무 짧습니다.' }), { status: 400 },
    )));
    open();

    await search('ㄱ');

    expect(await screen.findByRole('alert')).toHaveTextContent('검색어가 너무 짧습니다.');
  });

  it('길이 끊기면 말한다 — 조용히 새지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await search('장보영');

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});

/**
 * **누구에게 주는지 끝까지 보여 준다.** 다음 검색이 앞서 고른 사람을 화면에서 지우면,
 * 남는 것은 "3명" 이라는 수뿐이다.
 */
describe('고른 회원', () => {
  it('고르면 이름이 남는다', async () => {
    open();

    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));

    expect(within(pickedList()).getByRole('button', { name: '장보영 빼기' })).toBeDefined();
  });

  /* 여기가 고장이 있던 자리다 */
  it('다음 검색을 해도 앞서 고른 사람이 그대로 보인다', async () => {
    open();

    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));

    vi.stubGlobal('fetch', users(['u-2', '김회사', 'b@plain.test']));
    await search('김회사');
    await screen.findByLabelText(/김회사/);

    expect(within(pickedList()).getByRole('button', { name: '장보영 빼기' })).toBeDefined();
  });

  it('두 검색에서 하나씩 골라도 둘 다 남는다', async () => {
    open();

    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));
    vi.stubGlobal('fetch', users(['u-2', '김회사', 'b@plain.test']));
    await search('김회사');
    await userEvent.click(screen.getByLabelText(/김회사/));

    const names = within(pickedList()).getAllByRole('button').map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['장보영 빼기', '김회사 빼기']);
  });

  it('칩을 누르면 빠진다', async () => {
    open();

    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));
    await userEvent.click(within(pickedList()).getByRole('button', { name: '장보영 빼기' }));

    expect(screen.queryByRole('list', { name: '지급할 회원' })).toBeNull();
  });

  it('고른 수와 남은 수량을 함께 적는다', async () => {
    open();

    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));

    expect(screen.getByText(/고른 회원/)).toHaveTextContent('1');
    // 남은 수량 = 상한 100 - 지급 12
    expect(screen.getByText(/남은 수량/)).toHaveTextContent('88');
  });
});

describe('지급할 때', () => {
  const pickOne = async () => {
    await search('장보영');
    await userEvent.click(screen.getByLabelText(/장보영/));
  };

  it('아무도 안 골랐으면 누를 수 없다', () => {
    open();

    expect(screen.getByRole('button', { name: /지급/ })).toBeDisabled();
  });

  it('고른 사람들의 id 를 그 쿠폰으로 보낸다', async () => {
    const h = open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ issued: 1, skipped: 0 }), { status: 200 },
    )));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    await waitFor(() => expect(h.onDone).toHaveBeenCalledWith({ issued: 1, skipped: 0 }));
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/coupons/c-1/issue');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ userIds: ['u-1'] });
  });

  /** 이미 가진 사람은 건너뛴다 — 몇 명이 건너뛰어졌는지 부모가 말해야 한다 */
  it('건너뛴 수도 함께 넘긴다', async () => {
    const h = open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ issued: 0, skipped: 1 }), { status: 200 },
    )));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    await waitFor(() => expect(h.onDone).toHaveBeenCalledWith({ issued: 0, skipped: 1 }));
  });

  it('보내는 동안 단추가 이름을 바꾸고 눌리지 않는다', async () => {
    let release!: () => void;
    open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ issued: 1, skipped: 0 }), { status: 200 }));
    })));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    expect(screen.getByRole('button', { name: '지급하는 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '1명에게 지급' })).toBeDefined());
  });

  it('거절당하면 까닭을 말하고 부모에게 알리지 않는다', async () => {
    const h = open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: '남은 수량이 모자랍니다.' }), { status: 409 },
    )));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('남은 수량이 모자랍니다.');
    expect(h.onDone).not.toHaveBeenCalled();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('지급하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    open();
    await pickOne();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
