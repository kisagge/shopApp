// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import type { CouponRow } from '~/app/admin/coupons/types';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CouponBoard } = await import('~/app/admin/coupons/coupon-board');

/**
 * 쿠폰 목록을 들고 있는 자리.
 *
 * **할인 내용은 한 장이라도 나가면 못 고친다** — 받은 사람은 그때 조건으로 쓸 수
 * 있다고 믿는다. 그래서 이 화면이 할 수 있는 일은 중지·재개, 받기 공개·내림,
 * 그리고 지급뿐이고, 그 셋이 전부 **"이미 받은 사람" 과 "앞으로 받을 사람" 을
 * 가르는 말**을 운영자에게 해 줘야 한다.
 *
 * 줄을 바꿔 끼우는 성공 경로는 `coupon-board-row` 가 대상 칸 쪽에서 보고, 아래
 * 자식들(폼·지급 창구)은 저마다 검사가 있다. 여기서 보는 것은 **이 자리가 그
 * 결과를 받아 무엇을 바꾸고 무엇을 알리는가**다 — 그쪽이 통째로 안 돌고 있었다.
 */

const row = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c-1', code: 'AUTUMN20', name: '가을 쿠폰', kind: 'PERCENT',
  value: 0, percent: 20, maxDiscount: null, minimumOrder: 0,
  issueLimit: null, issuedCount: 0, usedCount: 0,
  startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-09-30T23:59:59+09:00',
  isActive: true, downloadable: false, status: 'ACTIVE', editable: true,
  targetCount: 0, targets: [],
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const board = (initial: readonly CouponRow[] = [row()]) =>
  render(<CouponBoard initial={initial} brands={[]} categories={[]} />);

/** 끝난 것을 알리는 자리는 sr-only 라 역할로 찾는다 */
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;
const sent = (call = 0) => JSON.parse(fetchMock.mock.calls[call]![1].body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('중지와 재개', () => {
  it('중지하면 이미 받은 사람은 계속 쓸 수 있다고 알린다', async () => {
    /*
     * 이 말이 없으면 운영자는 중지가 회수라고 생각한다. 중지는 **앞으로 받는
     * 길만** 닫는다 — 이미 지갑에 든 쿠폰은 그대로 쓸 수 있다.
     */
    fetchMock.mockResolvedValue(json(200, { coupon: { ...row(), isActive: false, status: 'INACTIVE' } }));
    board();

    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() =>
      expect(live()).toBe('가을 쿠폰 쿠폰을 중지했습니다. 이미 받은 사람은 계속 쓸 수 있습니다.'),
    );
    expect(sent()).toEqual({ isActive: false });
  });

  it('다시 열면 그 말을 붙이지 않는다 — 여는 쪽은 아무것도 끊지 않는다', async () => {
    const stopped = row({ isActive: false, status: 'INACTIVE' });
    fetchMock.mockResolvedValue(json(200, { coupon: row() }));
    board([stopped]);

    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 재개' }));

    await waitFor(() => expect(live()).toBe('가을 쿠폰 쿠폰을 다시 열었습니다.'));
    expect(sent()).toEqual({ isActive: true });
  });
});

describe('받기 목록 공개와 내림', () => {
  it('공개하면 누구나 받을 수 있다고 알린다', async () => {
    fetchMock.mockResolvedValue(json(200, { coupon: { ...row(), downloadable: true } }));
    board();

    await userEvent.click(screen.getByRole('button', { name: /가을 쿠폰.*받기/ }));

    await waitFor(() => expect(live()).toBe('가을 쿠폰 쿠폰을 누구나 받을 수 있게 공개했습니다.'));
    expect(sent()).toEqual({ downloadable: true });
  });

  it('내리면 이미 받은 사람은 계속 쓸 수 있다고 알린다', async () => {
    const open = row({ downloadable: true });
    fetchMock.mockResolvedValue(json(200, { coupon: row() }));
    board([open]);

    await userEvent.click(screen.getByRole('button', { name: /가을 쿠폰.*받기/ }));

    await waitFor(() =>
      expect(live()).toBe('가을 쿠폰 쿠폰을 받기 목록에서 내렸습니다. 이미 받은 사람은 계속 쓸 수 있습니다.'),
    );
    expect(sent()).toEqual({ downloadable: false });
  });
});

describe('바꾸지 못했을 때', () => {
  it('200 인데 쿠폰이 안 오면 실패로 본다 — 줄을 갈아 끼우지 않는다', async () => {
    /*
     * **상태만 보고 믿지 않는다.** 응답이 200 인데 몸통에 쿠폰이 없으면 화면이
     * 들고 있는 줄을 `undefined` 로 덮어쓰게 되고, 그러면 그 줄이 통째로 비어
     * 보인다 — 다시 불러오면 멀쩡해지니 보고도 믿기 어렵다.
     */
    fetchMock.mockResolvedValue(json(200, { ok: true }));
    board();

    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('바꾸지 못했습니다.'));
    expect(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' })).toBeInTheDocument();
    expect(live()).toBe('');
  });

  it('창구가 까닭을 적어 보내면 그 말을 쓴다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 끝난 쿠폰입니다.' }));
    board();

    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('이미 끝난 쿠폰입니다.'));
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    board();

    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('네트워크 오류로 바꾸지 못했습니다.'),
    );
  });
});

describe('만들기 폼을 여는 때', () => {
  it('쿠폰이 하나도 없으면 폼이 열린 채로 시작한다 — 빈 화면에 단추만 두지 않는다', () => {
    board([]);

    expect(screen.getByRole('button', { name: '쿠폰 만들기' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '새 쿠폰 만들기' })).toBeNull();
  });

  it('하나도 없으면 그 폼을 취소할 수도 없다 — 돌아갈 화면이 없다', () => {
    board([]);

    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
  });

  it('쿠폰이 있으면 단추로 시작하고, 누르면 폼이 열린다', async () => {
    board();
    expect(screen.queryByRole('button', { name: '쿠폰 만들기' })).toBeNull();

    await userEvent.click(screen.getByRole('button', { name: '새 쿠폰 만들기' }));

    expect(screen.getByRole('button', { name: '쿠폰 만들기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toBeInTheDocument();
  });

  it('취소하면 단추로 돌아온다', async () => {
    board();
    await userEvent.click(screen.getByRole('button', { name: '새 쿠폰 만들기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '새 쿠폰 만들기' })).toBeInTheDocument();
  });

  it('만들어지면 맨 앞에 끼우고 폼을 닫고 알린다', async () => {
    const created = row({ id: 'c-2', code: 'WELCOME10', name: '웰컴 쿠폰' });
    fetchMock.mockResolvedValue(json(200, { coupon: created }));
    board();

    await userEvent.click(screen.getByRole('button', { name: '새 쿠폰 만들기' }));
    await userEvent.type(screen.getByLabelText(/^코드/), 'WELCOME10');
    await userEvent.type(screen.getByLabelText(/^쿠폰 이름/), '웰컴 쿠폰');
    await userEvent.type(screen.getByLabelText(/^할인 금액/), '5000');
    fireEvent.change(screen.getByLabelText(/^시작/), { target: { value: '2026-10-01T00:00' } });
    fireEvent.change(screen.getByLabelText(/^종료/), { target: { value: '2026-12-31T23:59' } });
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }));

    await waitFor(() => expect(live()).toBe('웰컴 쿠폰 쿠폰을 만들었습니다.'));
    expect(screen.getByRole('button', { name: '새 쿠폰 만들기' })).toBeInTheDocument();
    // 새 줄이 맨 앞이다 — 방금 만든 것을 찾아 내려가지 않게
    const names = screen.getAllByRole('row').slice(1).map((r) => r.textContent ?? '');
    expect(names[0]).toContain('웰컴 쿠폰');
    expect(refresh).toHaveBeenCalled();
  });
});

describe('지급 창구', () => {
  const openGrant = async () => {
    board();
    await userEvent.click(screen.getByRole('button', { name: /가을 쿠폰.*지급/ }));
    return screen.getByRole('region', { name: '가을 쿠폰 지급' });
  };

  it('앞서 뜬 오류를 지우고 연다 — 지난 실패가 새 일을 가리지 않게', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 끝난 쿠폰입니다.' }));
    board();
    await userEvent.click(screen.getByRole('button', { name: '가을 쿠폰 쿠폰 중지' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: /가을 쿠폰.*지급/ }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('닫으면 창구가 사라진다', async () => {
    const panel = await openGrant();
    await userEvent.click(within(panel).getByRole('button', { name: '닫기' }));

    expect(screen.queryByRole('region', { name: '가을 쿠폰 지급' })).toBeNull();
  });

  it('지급이 끝나면 창구를 닫고 몇 명인지 알리고 목록을 다시 읽는다', async () => {
    /*
     * 발급 수가 늘었으므로 화면이 들고 있는 값이 낡는다 — 다시 읽지 않으면
     * "남은 수량" 이 옛 수로 남는다.
     */
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/users/search')
        ? json(200, { users: [{ id: 'u-1', name: '장보영', email: 'a@plain.test' }] })
        : json(200, { issued: 1, skipped: 0 }),
    );
    await openGrant();

    await userEvent.type(screen.getByLabelText(/회원 검색/), '장보영');
    await userEvent.click(screen.getByRole('button', { name: '찾기' }));
    await userEvent.click(await screen.findByLabelText(/장보영/));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    await waitFor(() => expect(live()).toBe('1명에게 지급했습니다.'));
    expect(screen.queryByRole('region', { name: '가을 쿠폰 지급' })).toBeNull();
    expect(refresh).toHaveBeenCalled();
  });

  it('이미 갖고 있어 건너뛴 사람이 있으면 그 수도 알린다 — 수가 모자라 보이면 다시 누른다', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      url.includes('/users/search')
        ? json(200, { users: [{ id: 'u-1', name: '장보영', email: 'a@plain.test' }] })
        : json(200, { issued: 1, skipped: 2 }),
    );
    await openGrant();

    await userEvent.type(screen.getByLabelText(/회원 검색/), '장보영');
    await userEvent.click(screen.getByRole('button', { name: '찾기' }));
    await userEvent.click(await screen.findByLabelText(/장보영/));
    await userEvent.click(screen.getByRole('button', { name: '1명에게 지급' }));

    await waitFor(() =>
      expect(live()).toBe('1명에게 지급했습니다. 2명은 이미 갖고 있어 건너뛰었습니다.'),
    );
  });
});
