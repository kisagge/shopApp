// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('~/lib/postcode', () => ({ openPostcodeSearch: vi.fn(() => Promise.resolve()) }));

const { AddressBook } = await import('~/components/address-book');

/** 배송지 고치기 — 그 줄이 채워진 폼이 되고, 저장하면 그 줄만 바뀌고 초점이 수정 단추로 돌아온다 */

const HOME = {
  id: 'a-1', label: '집', recipient: '장보영', phone: '01012345678', postalCode: '04766',
  address1: '서울 성동구 왕십리로 1', address2: '101호', isRemoteArea: false, isDefault: true,
};
const WORK = { ...HOME, id: 'a-2', label: '회사', recipient: '김회사', address2: null, isDefault: false };

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const setup = () => {
  const user = userEvent.setup();
  render(<AddressBook initial={[HOME, WORK]} remoteSurcharge={3000} />);
  return user;
};

describe('배송지 고치기', () => {
  it('수정을 누르면 그 줄이 지금 값으로 채운 폼이 되고, 이미 한 주문은 안 바뀐다고 말한다', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 수정' }));
    const form = screen.getByRole('region', { name: '장보영 님의 배송지 수정' });
    expect(within(form).getByLabelText(/받는 분/)).toHaveValue('장보영');
    expect(within(form).getByLabelText(/우편번호/)).toHaveValue('04766');
    expect(within(form).getByLabelText(/상세 주소/)).toHaveValue('101호');
    expect(form).toHaveTextContent('이미 주문한 건의 배송지는 바뀌지 않습니다.');
    // 한 번에 하나만 — 다른 줄의 수정 단추는 막힌다
    expect(screen.getByRole('button', { name: '김회사 님의 배송지 수정' })).toBeDisabled();
  });

  it('저장하면 PUT 으로 보내고, 그 줄만 바뀌고, 결과를 알리고, 초점이 그 줄의 수정 단추로 돌아온다', async () => {
    fetchMock.mockResolvedValue(Response.json({ address: { ...HOME, recipient: '장보영2', postalCode: '63309', isRemoteArea: true } }));
    const user = setup();
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 수정' }));
    const form = screen.getByRole('region', { name: '장보영 님의 배송지 수정' });
    await user.clear(within(form).getByLabelText(/받는 분/));
    await user.type(within(form).getByLabelText(/받는 분/), '장보영2');
    await user.click(within(form).getByRole('button', { name: '고친 내용 저장' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '장보영2 님의 배송지 수정' })).toHaveFocus());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/addresses/a-1');
    expect(init.method).toBe('PUT');
    // 고칠 때는 기본 여부를 지금 그대로 보낸다 — 새로 넣을 때처럼 기본으로 올리지 않는다
    expect(JSON.parse(init.body)).toMatchObject({ recipient: '장보영2', isDefault: true });
    expect(screen.getByText('장보영2 님의 배송지를 고쳤습니다.')).toBeInTheDocument();
    expect(screen.getByText(/도서산간 추가 배송비/)).toBeInTheDocument();
    expect(screen.getByText('김회사')).toBeInTheDocument();
  });

  it('취소하면 바뀐 것 없이 줄로 돌아오고 초점도 돌아온다', async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '김회사 님의 배송지 수정' }));
    await user.click(within(screen.getByRole('region', { name: '김회사 님의 배송지 수정' })).getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '김회사 님의 배송지 수정' })).toHaveFocus());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('서버가 칸 오류를 주면 폼에 남아 그 칸에 적는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '입력을 확인해 주세요', fields: { phone: '휴대폰 번호 형식이 아닙니다' } }, { status: 400 }));
    const user = setup();
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 수정' }));
    const form = screen.getByRole('region', { name: '장보영 님의 배송지 수정' });
    await user.click(within(form).getByRole('button', { name: '고친 내용 저장' }));
    await waitFor(() => expect(within(form).getByText('입력을 확인해 주세요')).toHaveAttribute('role', 'alert'));
    expect(form).toHaveTextContent('휴대폰 번호 형식이 아닙니다');
  });
});

/**
 * **배송지 지우기는 한 번 더 묻는다.**
 *
 * 첫 누름에 바로 지우고 있었다. 되돌리려면 우편번호부터 다시 찾아 상세 주소까지 새로 넣어야
 * 한다 — 되돌릴 수 있다고 하기엔 품이 크고, **고치기 단추 바로 옆자리**다.
 */
describe('배송지 지우기', () => {
  it('첫 누름으로는 지우지 않는다', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));

    expect(screen.getByText('이 배송지를 지울까요?')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 지운다', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const user = setup();

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제 확인' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/addresses/a-1',
      expect.objectContaining({ method: 'DELETE' }),
    ));
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  /** 묻는 것은 누른 줄 하나다 — 옆 줄까지 물음으로 바뀌면 어느 것을 지우는지 모른다 */
  it('묻는 자리는 누른 줄에만 선다', async () => {
    const user = setup();

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));

    expect(screen.getAllByText('이 배송지를 지울까요?')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '김회사 님의 배송지 삭제' })).toBeDefined();
  });
});

/**
 * **기본 배송지로 올리기.**
 *
 * 이 함수는 **한 줄도 돈 적이 없었다** — 커버리지로 물어서 찾았다. 결제 화면은 기본 배송지를
 * 그대로 쓰므로, 여기서 어긋나면 **다음 주문이 엉뚱한 곳으로 간다.**
 *
 * 목록 순서를 **서버와 같은 규칙으로** 맞추는 것이 요점이다(기본이 맨 위). 화면만 바꾸고
 * 정렬을 안 맞추면 새로 고칠 때 순서가 뒤집혀, 사람은 자기가 누른 것이 먹혔는지 의심한다.
 */
describe('기본 배송지로 올리기', () => {
  it('그 줄을 기본으로 올리고 맨 위로 세우고, 소리로도 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const user = setup();

    await user.click(screen.getByRole('button', { name: '기본으로' }));

    // 알림은 sr-only 의 aria-live 자리다 — 역할이 아니라 글자로 찾는다
    expect(await screen.findByText('김회사 님의 주소를 기본 배송지로 지정했습니다.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/api/addresses/a-2', expect.objectContaining({ method: 'PATCH' }));
    // 기본이 맨 위다 — 서버가 주는 순서와 같게 둔다
    const names = screen.getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(names[0]).toContain('김회사');
    // 기본이 된 줄에는 그 단추가 사라지고, 내려온 줄에 생긴다
    expect(screen.getByRole('button', { name: '기본으로' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: '기본으로' })).toHaveLength(1);
  });

  it.each([
    ['거절되면', async () => fetchMock.mockResolvedValue(Response.json({}, { status: 409 })), '기본 배송지를 바꾸지 못했습니다'],
    ['요청이 터지면', async () => fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다')), '네트워크 오류'],
  ])('%s 말하고 목록은 그대로다', async (_label, arrange, says) => {
    await arrange();
    const user = setup();

    await user.click(screen.getByRole('button', { name: '기본으로' }));

    expect((await screen.findByRole('alert')).textContent).toContain(says);
    // 맨 위는 그대로 장보영이다 — 화면만 먼저 바꾸지 않는다
    expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('장보영');
  });

  /** 보내는 동안 다른 단추를 잠근다 — 두 줄을 연달아 누르면 어느 것이 기본인지 서버와 어긋난다 */
  it('끝나면 단추가 다시 열린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const user = setup();

    await user.click(screen.getByRole('button', { name: '기본으로' }));
    await screen.findByText(/기본 배송지로 지정했습니다/);

    expect(screen.getByRole('button', { name: '장보영 님의 배송지 수정' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '기본으로' })).toBeEnabled();
  });
});

/**
 * **지우기가 실패했을 때.**
 *
 * 지우기는 한 번 더 묻고 나서 보낸다. 거기서 실패했는데 아무 말도 안 하면 **줄은 그대로
 * 남아 있고** 사람은 지워진 줄 알고 나간다 — 다음에 와서 그 주소가 있는 것을 보고
 * 지웠는지 안 지웠는지 헷갈린다.
 */
describe('배송지를 지우지 못하면', () => {
  it.each([
    ['거절되면', async () => fetchMock.mockResolvedValue(Response.json({}, { status: 409 })), '배송지를 지우지 못했습니다'],
    ['요청이 터지면', async () => fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다')), '네트워크 오류'],
  ])('%s 말하고 줄은 남는다', async (_label, arrange, says) => {
    await arrange();
    const user = setup();

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제 확인' }));

    expect((await screen.findByRole('alert')).textContent).toContain(says);
    expect(screen.getByText('장보영')).toBeInTheDocument();
  });
});

/**
 * **마지막 배송지를 지우면 넣을 자리를 바로 연다.**
 *
 * 배송지가 없으면 주문을 만들 수 없다. 빈 목록만 보여 주고 "새 배송지 추가" 를 한 번 더
 * 누르게 하면, 지운 사람은 **막다른 길**을 본다 — 등록할 곳이 어디에도 없다고 적혀 있던
 * 결제 화면과 같은 결함이다.
 */
describe('마지막 배송지를 지우면', () => {
  it('새 배송지 폼이 바로 열린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const user = userEvent.setup();
    render(<AddressBook initial={[HOME]} remoteSurcharge={3000} />);

    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제' }));
    await user.click(screen.getByRole('button', { name: '장보영 님의 배송지 삭제 확인' }));

    expect(await screen.findByRole('region', { name: '새 배송지' })).toBeInTheDocument();
    // 하나도 없으면 그만둘 수 없다 — 그만두면 다시 막다른 길이다
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
  });
});

/**
 * **새 배송지를 넣으면 그것이 기본이 된다.**
 *
 * 방금 넣은 주소로 보내려고 넣는 것이 대부분이다 — 넣고 나서 다시 "기본으로" 를 눌러야
 * 하면 그 한 번을 잊고 **옛 주소로 주문이 나간다.** 그래서 서버가 새것을 기본으로 올리고,
 * 화면도 그 모양을 그대로 따른다(맨 위, 기존 기본은 내려온다).
 */
describe('새 배송지 넣기', () => {
  const SAVED = {
    id: 'a-3', label: null, recipient: '박신규', phone: '01099998888', postalCode: '06236',
    address1: '서울 강남구 테헤란로 1', address2: null, isRemoteArea: false, isDefault: true,
  };

  const add = async () => {
    const user = setup();
    await user.click(screen.getByRole('button', { name: '새 배송지 추가' }));
    return { user, form: screen.getByRole('region', { name: '새 배송지' }) };
  };

  it('넣으면 맨 위에 서고 기본이 되며, 소리로도 알린다', async () => {
    fetchMock.mockResolvedValue(Response.json({ address: SAVED }));
    const { user, form } = await add();

    await user.type(within(form).getByLabelText(/받는 분/), '박신규');
    await user.type(within(form).getByLabelText(/휴대폰 번호/), '01099998888');
    await user.type(within(form).getByLabelText(/우편번호/), '06236');
    await user.type(within(form).getByLabelText(/^주소/), '서울 강남구 테헤란로 1');
    await user.click(within(form).getByRole('button', { name: '배송지 저장' }));

    expect(await screen.findByText('배송지를 추가했습니다.')).toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items[0]?.textContent).toContain('박신규');
    // 새것이 기본이라 그 줄에는 "기본으로" 가 없고, 내려온 줄에 생긴다
    expect(within(items[0]!).queryByRole('button', { name: '기본으로' })).toBeNull();
    expect(within(items[1]!).getByRole('button', { name: '기본으로' })).toBeInTheDocument();
    // 넣는 폼은 닫힌다 — 열린 채로 두면 또 넣는 줄 안다
    expect(screen.queryByRole('region', { name: '새 배송지' })).toBeNull();
  });

  /** 이미 배송지가 있으면 그만둘 수 있다 — 하나도 없을 때는 그만두면 막다른 길이라 주지 않는다 */
  it('배송지가 있으면 그만둘 수 있다', async () => {
    const { user, form } = await add();

    await user.click(within(form).getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('region', { name: '새 배송지' })).toBeNull();
    expect(screen.getByRole('button', { name: '새 배송지 추가' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
