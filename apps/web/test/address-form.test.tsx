// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SavedAddress } from '~/components/address-form';

/**
 * 배송지 입력 — **틀리면 물건이 다른 곳으로 간다.**
 *
 * 406줄로 가장 큰 미검사 파일이었다. 주소를 담는 검사와 주문 배송지를 고치는 검사가 지나가며 밟기는
 * 했지만, 이 폼 자체의 약속은 아무도 못 박지 않았다.
 *
 * **도서산간 여부는 묻지 않는다.** 추가 배송비가 걸린 값이라 사용자가 고르게 두면 제주에 사는 사람이
 * 체크를 풀고 3,000원을 아낀다. 우편번호를 넣으면 화면이 **그 자리에서** 알려 주고 — 결제 직전에
 * 처음 보면 놀란다 — 실제 판정은 서버가 한다.
 *
 * **추가 배송비를 상수에서 읽던 때가 있었다.** 그 값이 운영 데이터가 된 뒤로는 상수를 읽으면 운영이
 * 바꾼 값과 화면에 적힌 값이 갈린다 — 결제는 4,000원을 받는데 안내는 3,000원이라고 말하는 상태이고,
 * 그건 손님이 결제 직전에 발견한다. 그래서 값을 받아 적는다.
 */

const openPostcodeSearch = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/postcode', () => ({ openPostcodeSearch }));

const { AddressForm } = await import('~/components/address-form');

const saved = (over: Partial<SavedAddress> = {}): SavedAddress => ({
  id: 'a-1', label: '집', recipient: '장○○', phone: '010-1234-5678',
  postalCode: '04524', address1: '서울 중구 세종대로 110', address2: '3층',
  isRemoteArea: false, isDefault: true,
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
const onSaved = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ address: saved() }, { status: 201 }));
  openPostcodeSearch.mockResolvedValue(undefined);
});

const open = (props: Record<string, unknown> = {}) => {
  const user = userEvent.setup();
  render(<AddressForm onSaved={onSaved} remoteSurcharge={3_000} {...props} />);
  return user;
};

const fillAll = async (user: ReturnType<typeof userEvent.setup>, zip = '04524') => {
  await user.type(screen.getByLabelText(/받는 분/), '장○○');
  await user.type(screen.getByLabelText(/휴대폰 번호/), '010-1234-5678');
  await user.type(screen.getByLabelText(/우편번호/), zip);
  await user.type(screen.getByLabelText(/^주소/), '서울 중구 세종대로 110');
};

const submitButton = () => screen.getByRole('button', { name: '이 주소로 배송받기' });

describe('필수 칸', () => {
  it.each(['받는 분', '휴대폰 번호', '우편번호'])('%s 는 필수다', (label) => {
    open();

    expect(screen.getByLabelText(new RegExp(label))).toBeRequired();
  });

  it('상세 주소와 배송지 이름은 선택이다 — 없이도 보낼 수 있다', () => {
    open();

    expect(screen.getByLabelText(/상세 주소/)).not.toBeRequired();
    expect(screen.getByLabelText(/배송지 이름/)).not.toBeRequired();
  });
});

/**
 * **도서산간이면 저장하기 전에 알린다.** 우편번호를 다 넣는 순간 낭독기도 그 말을 듣는다(aria-live).
 */
describe('도서산간 안내', () => {
  const notice = () => document.querySelector('[aria-live="polite"]')!;

  it('제주 우편번호를 넣으면 그 자리에서 알린다', async () => {
    const user = open();

    await user.type(screen.getByLabelText(/우편번호/), '63000');

    expect(notice().textContent).toContain('제주특별자치도');
  });

  /** 지역 이름을 적어야 손님이 자기 주소가 맞는지 안다 — "도서산간입니다" 만으로는 모른다 */
  it.each([
    ['63000', '제주특별자치도'],
    ['40200', '울릉군'],
    ['23100', '인천 옹진군 도서'],
  ])('%s 는 %s 라고 적는다', async (zip, area) => {
    const user = open();

    await user.type(screen.getByLabelText(/우편번호/), zip);

    expect(notice().textContent).toContain(area);
  });

  it('추가 배송비는 받은 값을 적는다 — 상수를 읽으면 운영이 바꾼 값과 갈린다', async () => {
    const user = open({ remoteSurcharge: 4_000 });

    await user.type(screen.getByLabelText(/우편번호/), '63000');

    expect(notice().textContent).toContain('4,000');
    expect(notice().textContent).not.toContain('3,000');
  });

  it('도서산간이 아니면 아무 말도 하지 않는다', async () => {
    const user = open();

    await user.type(screen.getByLabelText(/우편번호/), '04524');

    expect(notice().textContent).toBe('');
  });

  /** 다 넣기 전에는 판단할 수 없다 — 네 자리에서 미리 겁주지 않는다 */
  it('다섯 자리가 되기 전에는 말하지 않는다', async () => {
    const user = open();

    await user.type(screen.getByLabelText(/우편번호/), '6300');

    expect(notice().textContent).toBe('');
  });

  /** 자리를 늘 비워 두면 안내가 떴다 사라질 때 아래 칸이 밀리지 않는다 */
  it('안내 자리는 비어 있어도 남는다', () => {
    open();

    expect(notice()).not.toBeNull();
  });
});

/**
 * **주소 검색은 편의지 유일한 길이 아니다.** 광고 차단기나 사내 네트워크에서 막힐 수 있고, 그때도
 * 손 입력은 그대로 된다.
 */
describe('주소 검색', () => {
  it('열면 검색 자리가 서고, 단추가 그 상태를 말한다', async () => {
    const user = open();

    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    const button = screen.getByRole('button', { name: '검색 닫기' });
    expect(button.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(openPostcodeSearch).toHaveBeenCalled());
  });

  it('고르면 우편번호와 주소를 채운다', async () => {
    openPostcodeSearch.mockImplementation(async (_box, onComplete) => {
      onComplete({ postalCode: '63000', address: '제주시 첨단로 242' });
    });
    const user = open();

    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    await waitFor(() =>
      expect(screen.getByLabelText<HTMLInputElement>(/우편번호/).value).toBe('63000'));
    expect(screen.getByLabelText<HTMLInputElement>(/^주소/).value).toBe('제주시 첨단로 242');
  });

  /** 고르고 나면 남은 것은 상세 주소뿐이다 — 거기로 데려다 준다 */
  it('고른 뒤 상세 주소로 초점을 옮긴다', async () => {
    openPostcodeSearch.mockImplementation(async (_box, onComplete) => {
      onComplete({ postalCode: '04524', address: '서울 중구 세종대로 110' });
    });
    const user = open();

    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    await waitFor(() => expect(screen.getByLabelText(/상세 주소/)).toHaveFocus());
  });

  /** 안 돌려주면 키보드 사용자는 문서 맨 위로 튕겨 나가 처음부터 다시 내려와야 한다 */
  it('닫으면 열었던 단추로 초점을 돌려준다', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    await user.click(screen.getByRole('button', { name: '닫기' }));

    expect(screen.getByRole('button', { name: '주소 검색' })).toHaveFocus();
  });

  it('Esc 로도 닫힌다', async () => {
    const user = open();
    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    await user.keyboard('{Escape}');

    expect(screen.getByRole('button', { name: '주소 검색' })).toBeDefined();
  });

  it('못 불러오면 단추를 감추고 까닭을 말한다 — 손 입력은 그대로 된다', async () => {
    openPostcodeSearch.mockRejectedValue(new Error('blocked'));
    const user = open();

    await user.click(screen.getByRole('button', { name: '주소 검색' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/직접 입력/));
    expect(screen.queryByRole('button', { name: '주소 검색' })).toBeNull();
    expect(screen.getByLabelText(/우편번호/)).toBeDefined();
  });
});

describe('주소록에 담을 때', () => {
  it('새 주소는 POST 로 보내고 기본으로 삼는다', async () => {
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect([url, init.method]).toEqual(['/api/addresses', 'POST']);
    expect(JSON.parse(init.body)).toMatchObject({
      recipient: '장○○', postalCode: '04524', address1: '서울 중구 세종대로 110', isDefault: true,
    });
  });

  it('고칠 때는 그 주소로 PUT 하고 기본 여부를 건드리지 않는다', async () => {
    const user = open({ editing: saved({ isDefault: false }) });

    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect([url, init.method]).toEqual(['/api/addresses/a-1', 'PUT']);
    expect(JSON.parse(init.body)).toMatchObject({ isDefault: false });
  });

  it('고칠 주소를 받으면 칸을 그 값으로 채운다', () => {
    open({ editing: saved() });

    expect(screen.getByLabelText<HTMLInputElement>(/받는 분/).value).toBe('장○○');
    expect(screen.getByLabelText<HTMLInputElement>(/상세 주소/).value).toBe('3층');
    expect(screen.getByLabelText<HTMLInputElement>(/배송지 이름/).value).toBe('집');
  });

  /** 고친 주소로 이미 한 주문까지 바뀌는 줄 알면, 배송 중인 주문을 옮기려고 여기를 고친다 */
  it('고칠 때는 지난 주문이 안 바뀐다고 말한다', () => {
    open({ editing: saved() });

    expect(screen.getByText(/이미 주문한 건의 배송지는 바뀌지 않습니다/)).toBeDefined();
  });

  it('새로 담을 때는 그 말을 하지 않는다', () => {
    open();

    expect(screen.queryByText(/이미 주문한 건의 배송지는/)).toBeNull();
  });

  it('비운 상세 주소·이름표는 아예 보내지 않는다 — 빈 글자를 저장하지 않는다', async () => {
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    const body = JSON.parse(init.body) as Record<string, unknown>;
    expect('address2' in body).toBe(false);
    expect('label' in body).toBe(false);
  });
});

/**
 * **같은 칸을 다른 창구로 보낸다.** 주문의 배송지를 고칠 때다 — 우편번호 검색·도서산간 안내·칸별
 * 오류 표시를 한 벌 더 적지 않으려고 창구만 갈아 끼운다.
 */
describe('다른 창구로 보낼 때', () => {
  it('fetch 를 쓰지 않고 받은 함수를 부른다', async () => {
    const submit = vi.fn().mockResolvedValue(null);
    const user = open({ submit, editing: saved() });

    await user.click(submitButton());

    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(fetchMock).not.toHaveBeenCalled();
    expect(submit.mock.calls[0]![0]).toMatchObject({ recipient: '장○○', postalCode: '04524' });
  });

  /** 주문 하나의 배송지를 고치는 자리다 — 이름표와 "지난 주문" 안내는 주소록의 것이다 */
  it('이름표 칸과 지난 주문 안내를 내밀지 않는다', () => {
    open({ submit: vi.fn(), editing: saved() });

    expect(screen.queryByLabelText(/배송지 이름/)).toBeNull();
    expect(screen.queryByText(/이미 주문한 건의 배송지는/)).toBeNull();
  });

  it('저장한 값을 그대로 돌려준다 — 목록을 다시 읽지 않고 그릴 수 있게', async () => {
    const submit = vi.fn().mockResolvedValue(null);
    const user = open({ submit, prefill: {
      recipient: '김○○', phone: '010-9999-8888', postalCode: '63000',
      address1: '제주시 첨단로 242', address2: null,
    } });

    await user.click(submitButton());

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0]![0]).toMatchObject({
      recipient: '김○○', postalCode: '63000', isRemoteArea: true,
    });
  });

  it('창구가 칸별 오류를 주면 그 칸에 붙인다', async () => {
    const submit = vi.fn().mockResolvedValue({
      message: '배송지를 고치지 못했습니다.', fields: { phone: '번호 형식을 확인해 주세요' },
    });
    const user = open({ submit, editing: saved() });

    await user.click(submitButton());

    // 칸 옆의 오류도 role=alert 다 — 폼 맨 위의 것과 칸의 것을 글로 가린다
    await waitFor(() => expect(screen.getByText('배송지를 고치지 못했습니다.')).toBeDefined());
    expect(screen.getByText('번호 형식을 확인해 주세요')).toBeDefined();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });
});

describe('실패했을 때', () => {
  /** 칸 옆에만 적으면 낭독기 사용자는 제출 뒤 무슨 일이 일어났는지 모른 채 남는다 */
  it('까닭을 폼 맨 위에서 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '주소를 확인해 주세요.' }, { status: 400 }));
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('주소를 확인해 주세요.'));
  });

  /** 앞단이 JSON 이 아닌 오류를 주면 네트워크 오류로 오해하게 두지 않는다 */
  it('JSON 이 아닌 응답에도 기본 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('배송지를 저장하지 못했습니다.'));
  });

  it('네트워크가 끊기면 그렇게 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('두 번 눌러 주소가 둘이 되지 않는다', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { release = resolve; }));
    const user = open();
    await fillAll(user);

    await user.click(submitButton());

    await waitFor(() => expect(screen.getByRole('button', { name: '저장하는 중…' })).toBeDisabled());
    release(Response.json({ address: saved() }, { status: 201 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe('폼 안에 함께 세우는 칸', () => {
  /** 밖에 두면 Enter 로 저장되지 않는다 — 주문의 배송 요청사항이 그 자리다 */
  it('받은 칸을 폼 안에 세운다', () => {
    open({ extraFields: <input aria-label="배송 요청사항" name="memo" /> });

    expect(screen.getByLabelText('배송 요청사항').closest('form')).not.toBeNull();
  });

  it('취소를 받으면 그 단추를 둔다', async () => {
    const onCancel = vi.fn();
    const user = open({ onCancel });

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(onCancel).toHaveBeenCalled();
  });

  it('저장 단추의 말을 바꿔 쓸 수 있다', () => {
    open({ submitLabel: '이 주소로 고치기' });

    expect(screen.getByRole('button', { name: '이 주소로 고치기' })).toBeDefined();
  });
});
