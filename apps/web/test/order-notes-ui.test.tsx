// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));

const { OrderNotes } = await import('~/components/admin/order-notes');

/** 주문 메모 — 누가 읽는지 칸에 묶고, 남기면 비우고, 지우기는 한 번 더 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const NOTES = [
  { id: 'n-1', body: '부재 시 경비실\n선물 포장', createdAt: '2026-09-15T01:00:00.000Z', authorName: '운영자', merchantName: null, deletable: true },
  { id: 'n-2', body: '출고 하루 지연', createdAt: '2026-09-15T02:00:00.000Z', authorName: '스튜디오눈 담당자', merchantName: '스튜디오눈', deletable: false },
];

describe('주문 메모', () => {
  it('메모마다 쓴 사람과 쪽(운영진·가맹점 이름), 지울 수 있는 것에만 삭제 단추', () => {
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);
    const items = within(screen.getByRole('list', { name: '메모 목록' })).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('운영자운영진');
    expect(items[1]).toHaveTextContent('스튜디오눈');
    expect(screen.getAllByRole('button', { name: /메모 삭제$/ })).toHaveLength(1);
  });

  it('누가 읽는지를 칸에 묶는다 — 운영진과 가맹점이 다르게 듣는다', () => {
    const { unmount } = render(<OrderNotes orderNo="x" notes={[]} audience="staff" />);
    expect(screen.getByLabelText('메모 남기기')).toHaveAccessibleDescription(/운영진 메모는 가맹점에게도 보이지 않습니다/);
    unmount();
    render(<OrderNotes orderNo="x" notes={[]} audience="merchant" />);
    expect(screen.getByLabelText('메모 남기기')).toHaveAccessibleDescription(/가맹점 메모는 운영진도 봅니다/);
  });

  it('비워 두고 남기면 보내지 않고 칸으로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<OrderNotes orderNo="x" notes={[]} audience="staff" />);
    await user.click(screen.getByRole('button', { name: '메모 남기기' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText('메모 남기기')).toHaveFocus();
    expect(screen.getByRole('alert')).toHaveTextContent('메모를 입력해 주세요.');
  });

  it('남기면 칸을 비우고 알림 영역에 적고 목록을 다시 읽는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'n-3' }, { status: 201 }));
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={[]} audience="staff" />);
    await user.type(screen.getByLabelText('메모 남기기'), '선물 포장 요청');
    await user.click(screen.getByRole('button', { name: '메모 남기기' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('메모를 남겼습니다.'));
    expect(screen.getByLabelText('메모 남기기')).toHaveValue('');
    expect(refresh).toHaveBeenCalled();
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/orders/20260915-0000001/notes');
  });

  it('지우기는 한 번 더 묻고, 지우면 입력 칸으로 초점을 옮긴다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'n-1' }));
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);
    await user.click(screen.getByRole('button', { name: /메모 삭제$/ }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(within(screen.getByRole('group', { name: /메모 삭제 확인$/ })).getByRole('button', { name: '지우기' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('메모를 지웠습니다.'));
    expect(fetchMock.mock.calls[0]).toEqual(['/api/admin/orders/20260915-0000001/notes/n-1', { method: 'DELETE' }]);
    expect(screen.getByLabelText('메모 남기기')).toHaveFocus();
  });

  it('서버가 막으면 이유를 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '메모는 남긴 사람만 지울 수 있습니다.' }, { status: 403 }));
    const user = userEvent.setup();
    render(<OrderNotes orderNo="x" notes={NOTES} audience="staff" />);
    await user.click(screen.getByRole('button', { name: /메모 삭제$/ }));
    await user.click(screen.getByRole('button', { name: '지우기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('남긴 사람만'));
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * **메모를 남기지 못했을 때.**
 *
 * 주문 메모는 다음 사람이 읽을 글이다 — "부재 시 경비실", "출고 하루 지연". 실패했는데
 * 아무 말도 안 하면 적은 사람은 남은 줄 알고 넘어가고, **다음 사람은 그 사실을 모른 채**
 * 주문을 처리한다.
 */
describe('메모를 남기지 못하면', () => {
  const write = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.type(screen.getByLabelText('메모 남기기'), '경비실에 맡겨 달라고 함');
    await user.click(screen.getByRole('button', { name: '메모 남기기' }));
  };

  it('서버가 한 말을 보여 준다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '이미 처리된 주문입니다.' }, { status: 409 }));
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);

    await write(user);

    expect((await screen.findByRole('alert')).textContent).toContain('이미 처리된 주문입니다.');
  });

  it.each([
    ['아무 말도 안 하면', async () => fetchMock.mockResolvedValue(Response.json({}, { status: 500 })), '메모를 남기지 못했습니다'],
    ['요청이 못 가면', async () => fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다')), '네트워크 오류로 메모를 남기지 못했습니다'],
  ])('%s 무엇이 안 됐는지 말한다', async (_label, arrange, says) => {
    await arrange();
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);

    await write(user);

    expect((await screen.findByRole('alert')).textContent).toContain(says);
  });

  /** 적은 글을 지우면 다시 쓴다 — 성공했을 때만 비운다 */
  it('적은 글은 남는다', async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 500 }));
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);

    await write(user);
    await screen.findByRole('alert');

    expect(screen.getByLabelText<HTMLTextAreaElement>('메모 남기기').value).toBe('경비실에 맡겨 달라고 함');
  });
});

describe('메모를 지우지 못하면', () => {
  const confirmDelete = async (user: ReturnType<typeof userEvent.setup>) => {
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);
    await user.click(screen.getByRole('button', { name: /메모 삭제$/ }));
    await user.click(screen.getByRole('button', { name: '지우기' }));
  };

  it('요청이 못 가면 그렇게 말하고 줄은 남는다', async () => {
    fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다'));
    const user = userEvent.setup();

    await confirmDelete(user);

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류로 메모를 지우지 못했습니다');
    expect(screen.getByText(/경비실/)).toBeInTheDocument();
  });

  /** 물었다가 그만두면 아무 일도 없다 — 되돌릴 수 없는 일 앞의 두 번째 누름이다 */
  it('물었다가 그만두면 보내지 않는다', async () => {
    const user = userEvent.setup();
    render(<OrderNotes orderNo="20260915-0000001" notes={NOTES} audience="staff" />);

    await user.click(screen.getByRole('button', { name: /메모 삭제$/ }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByText('되돌릴 수 없습니다. 지울까요?')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
