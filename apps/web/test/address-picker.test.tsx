// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 배송지 고르기.
 *
 * **이 조각에는 검사가 하나도 없었다** — 커버리지로 물어서 찾았다(이름으로 세던 동안에는
 * 보이지 않았다). 행복한 길은 e2e 가 밟는데(`새 배송지 추가`·`기본`·`도서산간 추가 배송비`)
 * **실패와 전이 상태는 어디에도 없었다.** 그리고 그 안에 결함이 있었다.
 */

/** 새 주소 입력 폼은 따로 검사한다 — 여기서는 "그 화면으로 갔는가" 만 본다 */
vi.mock('~/components/address-form', () => ({
  AddressForm: ({ submitLabel, onCancel }: { submitLabel: string; onCancel: () => void }) => (
    <div>
      <p>주소 입력 폼</p>
      <button type="button">{submitLabel}</button>
      <button type="button" onClick={onCancel}>폼 그만</button>
    </div>
  ),
}));

const { AddressPicker } = await import('~/components/address-picker');

const saved = (over: Record<string, unknown> = {}) => ({
  id: 'a-1',
  label: '집',
  recipient: '홍길동',
  phone: '010-1234-5678',
  postalCode: '04524',
  address1: '서울 중구 세종대로 110',
  address2: '3층',
  isDefault: true,
  isRemoteArea: false,
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
const onPicked = vi.fn();
const onCancel = vi.fn();

const open = (over: Record<string, unknown> = {}) =>
  render(
    <AddressPicker
      currentId="a-1"
      onPicked={onPicked}
      onCancel={onCancel}
      remoteSurcharge={4_000}
      {...over}
    />,
  );

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(Response.json({ addresses: [saved()] }));
  vi.stubGlobal('fetch', fetchMock);
});

describe('목록을 불러올 때', () => {
  it('저장된 주소를 라디오로 세운다 — 화살표로 옮겨 다닐 수 있어야 한다', async () => {
    open();

    expect(await screen.findByRole('radio', { name: /홍길동/ })).toBeChecked();
  });

  it('기본 배송지는 그렇다고 적는다', async () => {
    open();

    expect(await screen.findByText('기본')).toBeDefined();
  });

  /**
   * **추가 배송비는 서버가 준 값을 쓴다.** 예전에는 상수를 직접 읽었는데, 그 값이 운영
   * 데이터가 된 뒤로는 결제가 받는 금액과 화면이 적는 금액이 갈렸다.
   */
  it('도서산간이면 서버가 준 추가 배송비를 적는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ addresses: [saved({ isRemoteArea: true })] }));

    open({ remoteSurcharge: 4_000 });

    expect((await screen.findByText(/도서산간/)).textContent).toContain('4,000');
  });

  it('저장된 것이 없으면 곧장 입력 화면으로 — 빈 목록만 보여 주면 또 눌러야 한다', async () => {
    fetchMock.mockResolvedValue(Response.json({ addresses: [] }));

    open();

    expect(await screen.findByText('주소 입력 폼')).toBeDefined();
  });

  /**
   * **한 번만 부른다.** 이 효과는 `t` 에 걸려 있고, `t` 가 그릴 때마다 새로 만들어지는
   * 값이 되면 **그릴 때마다 창구를 거는** 상태가 된다 — 지금은 사전이 바뀔 때만 바뀌어서
   * 조용하다. 그 조용함을 여기서 못 박는다.
   */
  it('다시 그려도 한 번만 부른다', async () => {
    const { rerender } = open();
    await screen.findByRole('radio', { name: /홍길동/ });

    rerender(
      <AddressPicker currentId="a-1" onPicked={onPicked} onCancel={onCancel} remoteSurcharge={4_000} />,
    );

    expect(fetchMock.mock.calls.filter((c) => c[0] === '/api/addresses')).toHaveLength(1);
  });
});

/**
 * **불러오지 못했을 때가 가장 나빴다.**
 *
 * 오류는 세웠는데 목록이 `null` 이라, 그 위의 "불러오는 중" 이 먼저 돌아갔다 — **실패가
 * 영원한 로딩으로 보였고** 빠져나갈 단추도 없었다. 이 세션에 고친 결제 쪽 결함 셋이 전부
 * 같은 모양이었다: 실패가 진행 중으로 보인다.
 */
describe('불러오지 못했을 때', () => {
  it('불러오는 중이라고 하지 않는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    open();

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(screen.queryByText('불러오는 중')).toBeNull();
  });

  it('못 불러왔다고 소리로도 말한다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));

    open();

    expect((await screen.findByRole('alert')).textContent).toContain('배송지를 불러오지 못했습니다');
  });

  it('빠져나갈 길을 준다 — 막힌 화면에 갇히지 않는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    open();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('다시 시도하면 다시 부른다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const user = userEvent.setup();

    open();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('radio', { name: /홍길동/ })).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('고른 주소를 쓸 때', () => {
  it('그 주소를 기본으로 바꾸고 부른 쪽에 넘긴다', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('radio', { name: /홍길동/ });

    await user.click(screen.getByRole('button', { name: '이 주소로 배송받기' }));

    await waitFor(() => expect(onPicked).toHaveBeenCalledWith(expect.objectContaining({ id: 'a-1' })));
    expect(fetchMock).toHaveBeenCalledWith('/api/addresses/a-1', { method: 'PATCH' });
  });

  it('거절되면 그 말을 하고 목록은 남는다 — 고른 것을 잃지 않는다', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('radio', { name: /홍길동/ });
    fetchMock.mockResolvedValueOnce(Response.json({ message: '안 됩니다' }, { status: 409 }));

    await user.click(screen.getByRole('button', { name: '이 주소로 배송받기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('배송지를 바꾸지 못했습니다');
    expect(screen.getByRole('radio', { name: /홍길동/ })).toBeDefined();
    expect(onPicked).not.toHaveBeenCalled();
  });

  it('창구가 끊기면 네트워크 오류로 말한다', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('radio', { name: /홍길동/ });
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await user.click(screen.getByRole('button', { name: '이 주소로 배송받기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류');
  });

  /** 보내는 중에 다시 눌리면 같은 요청이 두 번 나간다 */
  it('보내는 중에는 단추가 잠기고 그렇다고 적는다', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('radio', { name: /홍길동/ });

    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));
    await user.click(screen.getByRole('button', { name: '이 주소로 배송받기' }));

    const sending = await screen.findByRole('button', { name: '바꾸는 중…' });
    expect(sending).toBeDisabled();

    release(Response.json({}));
    await waitFor(() => expect(onPicked).toHaveBeenCalled());
  });
});

describe('새 주소를 더할 때', () => {
  it('입력 화면으로 가고, 그만두면 목록으로 돌아온다', async () => {
    const user = userEvent.setup();
    open();
    await screen.findByRole('radio', { name: /홍길동/ });

    await user.click(screen.getByRole('button', { name: '새 배송지 추가' }));
    expect(screen.getByText('주소 입력 폼')).toBeDefined();

    await user.click(screen.getByRole('button', { name: '폼 그만' }));
    expect(screen.getByRole('radio', { name: /홍길동/ })).toBeDefined();
  });

  /** 저장된 것이 없으면 돌아갈 목록이 없다 — 그만두기는 고르기를 통째로 닫는다 */
  it('저장된 것이 없을 때 그만두면 고르기를 닫는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ addresses: [] }));
    const user = userEvent.setup();

    open();
    await screen.findByText('주소 입력 폼');
    await user.click(screen.getByRole('button', { name: '폼 그만' }));

    expect(onCancel).toHaveBeenCalled();
  });
});
