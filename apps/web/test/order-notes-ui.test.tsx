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
