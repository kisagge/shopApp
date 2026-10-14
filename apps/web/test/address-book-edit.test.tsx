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
