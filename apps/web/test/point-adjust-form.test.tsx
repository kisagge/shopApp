// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));

const { PointAdjustForm } = await import('~/components/admin/point-adjust-form');

/** 적립금 수동 조정 폼 — 한 번 더 보여 주고, 같은 열쇠로 다시 보내고, 끝나면 새 열쇠 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

const setup = () => {
  const user = userEvent.setup();
  render(<PointAdjustForm userId="u-1" userName="김손님" balance={5_000} />);
  return user;
};

describe('포인트 조정 폼', () => {
  it('사유는 손님 내역에 보인다고 칸에 묶어 말한다', () => {
    setup();
    expect(screen.getByLabelText('사유')).toHaveAccessibleDescription(/손님 적립금 내역에 그대로 보입니다/);
    expect(screen.getByRole('group', { name: '지급 또는 차감' })).toBeInTheDocument();
  });

  it('비었거나 잔액보다 많이 빼면 칸에 이유를 묶고 첫 칸으로 초점을 옮긴다 — 보내지 않는다', async () => {
    const user = setup();
    await user.click(screen.getByRole('radio', { name: '차감' }));
    await user.type(screen.getByLabelText('포인트'), '6000');
    await user.click(screen.getByRole('button', { name: '확인' }));
    const amount = screen.getByLabelText('포인트');
    expect(amount).toHaveFocus();
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(/지금 잔액\(5,000P\)보다 많이 차감할 수 없습니다/);
    expect(screen.getByLabelText('사유')).toHaveAccessibleDescription(/사유를 입력해 주세요/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('보내기 전에 누구에게 얼마, 잔액이 어떻게 바뀌는지 확인 단추에 묶어 보여 준다', async () => {
    const user = setup();
    await user.type(screen.getByLabelText('포인트'), '3000');
    await user.type(screen.getByLabelText('사유'), '배송 지연 보상');
    await user.click(screen.getByRole('button', { name: '확인' }));
    const confirm = screen.getByRole('button', { name: '지급하기' });
    expect(confirm).toHaveFocus();
    expect(confirm).toHaveAccessibleDescription('김손님님에게 3,000P를 지급합니다.잔액 5,000P → 8,000P · 사유 “배송 지연 보상”');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('끝나면 결과를 알림 영역에 적고, 칸을 비우고, 다음 조정에는 새 열쇠를 쓴다', async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(Response.json({ direction: 'GRANT', amount: 3_000, balance: 8_000, replayed: false })),
    );
    const user = setup();
    await user.type(screen.getByLabelText('포인트'), '3000');
    await user.type(screen.getByLabelText('사유'), '배송 지연 보상');
    await user.click(screen.getByRole('button', { name: '확인' }));
    await user.click(screen.getByRole('button', { name: '지급하기' }));

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('김손님님에게 3,000P를 지급했습니다. 잔액 8,000P.'));
    expect(refresh).toHaveBeenCalled();
    expect(screen.getByLabelText('포인트')).toHaveValue(null);
    const first = JSON.parse(fetchMock.mock.calls[0]?.[1].body);
    expect(first).toMatchObject({ direction: 'GRANT', amount: 3_000, note: '배송 지연 보상' });

    await user.type(screen.getByLabelText('포인트'), '10');
    await user.type(screen.getByLabelText('사유'), '또');
    await user.click(screen.getByRole('button', { name: '확인' }));
    await user.click(screen.getByRole('button', { name: '지급하기' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).key).not.toBe(first.key);
  });

  it('응답을 못 받으면 확인 단계에 남아, 다시 누르면 같은 열쇠로 보낸다', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline')).mockResolvedValueOnce(
      Response.json({ direction: 'GRANT', amount: 3_000, balance: 8_000, replayed: true }),
    );
    const user = setup();
    await user.type(screen.getByLabelText('포인트'), '3000');
    await user.type(screen.getByLabelText('사유'), '배송 지연 보상');
    await user.click(screen.getByRole('button', { name: '확인' }));
    await user.click(screen.getByRole('button', { name: '지급하기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('두 번 처리되지 않습니다'));

    await user.click(screen.getByRole('button', { name: '지급하기' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1].body).key).toBe(JSON.parse(fetchMock.mock.calls[0]?.[1].body).key);
  });

  it('서버가 막으면 이유를 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'INSUFFICIENT_POINTS', message: '차감할 포인트가 지금 잔액보다 많습니다' }, { status: 409 }));
    const user = setup();
    await user.click(screen.getByRole('radio', { name: '차감' }));
    await user.type(screen.getByLabelText('포인트'), '100');
    await user.type(screen.getByLabelText('사유'), '잘못 준 적립');
    await user.click(screen.getByRole('button', { name: '확인' }));
    await user.click(screen.getByRole('button', { name: '차감하기' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('잔액보다 많습니다'));
    expect(refresh).not.toHaveBeenCalled();
  });
});
