// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { HoldButton } = await import('~/app/admin/settlements/settlement-actions');

/**
 * 정산 지급 보류·해제 단추.
 *
 * 보류 상태는 있었는데 보류할 길이 없었다. 보류는 까닭을 적어야 누를 수 있다 — 가맹점도 그 까닭을 본다.
 */

/*
 * 단추 이름은 "무어 보류" 다. 숨긴 가맹점 이름과 보이는 글자 사이의 띄어쓰기를 jsdom 의 이름 계산은 지우고 브라우저는
 * 남긴다 — 띄어쓰기에 기대지 않고 둘 다 맞춘다.
 */
const HOLD = /^무어\s*보류$/;
const RELEASE = /^무어\s*보류 해제$/;

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: 's-1', status: 'HELD', reason: '계좌 확인 중' }));
});

describe('보류', () => {
  it('누르면 까닭 칸이 열리고 초점이 그리로 간다', async () => {
    const user = userEvent.setup();
    render(<HoldButton settlementId="s-1" merchantName="무어" held={false} />);

    await user.click(screen.getByRole('button', { name: HOLD }));

    const form = screen.getByRole('form', { name: '무어 정산 지급 보류' });
    expect(form).toBeInTheDocument();
    expect(screen.getByLabelText('보류 까닭')).toHaveFocus();
    expect(screen.getByLabelText('보류 까닭')).toHaveAccessibleDescription('가맹점 정산 화면에도 보입니다.');
  });

  it('까닭 없이는 보내지 않고 왜 안 되는지 말한다', async () => {
    const user = userEvent.setup();
    render(<HoldButton settlementId="s-1" merchantName="무어" held={false} />);

    await user.click(screen.getByRole('button', { name: HOLD }));
    await user.click(screen.getByRole('button', { name: '보류하기' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('까닭');
    expect(screen.getByLabelText('보류 까닭')).toHaveAttribute('aria-invalid', 'true');
  });

  it('까닭을 적으면 보류를 보내고 화면을 다시 읽는다', async () => {
    const user = userEvent.setup();
    render(<HoldButton settlementId="s-1" merchantName="무어" held={false} />);

    await user.click(screen.getByRole('button', { name: HOLD }));
    await user.type(screen.getByLabelText('보류 까닭'), '  계좌 확인 중 ');
    await user.click(screen.getByRole('button', { name: '보류하기' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/settlements/s-1/hold', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ hold: true, reason: '계좌 확인 중' }),
    }));
  });

  it('취소하면 아무것도 보내지 않고 단추로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<HoldButton settlementId="s-1" merchantName="무어" held={false} />);

    await user.click(screen.getByRole('button', { name: HOLD }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: HOLD })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('거절되면 서버가 준 까닭을 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ message: '확정된 정산만 보류할 수 있습니다' }, { status: 409 }));
    render(<HoldButton settlementId="s-1" merchantName="무어" held={false} />);

    await user.click(screen.getByRole('button', { name: HOLD }));
    await user.type(screen.getByLabelText('보류 까닭'), '확인');
    await user.click(screen.getByRole('button', { name: '보류하기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('확정된 정산만 보류할 수 있습니다');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('해제', () => {
  it('보류 중이면 한 번에 푼다', async () => {
    const user = userEvent.setup();
    render(<HoldButton settlementId="s-1" merchantName="무어" held />);

    await user.click(screen.getByRole('button', { name: RELEASE }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![1].body).toBe(JSON.stringify({ hold: false }));
  });
});
