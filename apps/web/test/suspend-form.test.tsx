// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { SuspendForm } = await import('~/app/admin/users/suspend-form');

/** 운영 회원 목록의 이용 정지 칸 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue({ ok: true, json: () => Promise.resolve({}) });
  vi.stubGlobal('fetch', fetchMock);
});

describe('이용 정지 폼', () => {
  it('정지는 사유를 적어야 누를 수 있고, 로그인이 끊긴다는 설명이 입력에 이어진다', async () => {
    const user = userEvent.setup();
    render(<SuspendForm userId="u-1" userName="홍길동" suspendedAt={null} suspendedReason={null} />);

    await user.click(screen.getByRole('button', { name: '이용 정지' }));
    const form = screen.getByRole('form', { name: '홍길동 이용 정지' });
    const reason = screen.getByLabelText(/정지 사유/);
    expect(form).toBeTruthy();
    // 누른 단추가 사라지므로 초점이 사유 입력으로 와야 한다
    expect(document.activeElement).toBe(reason);
    expect(reason.getAttribute('aria-describedby')).toBeTruthy();
    expect(document.getElementById(reason.getAttribute('aria-describedby')!)?.textContent).toContain('로그인이 바로 끊기고');
    expect(screen.getByRole('button', { name: '정지' }).hasAttribute('disabled')).toBe(true);

    await user.type(reason, '결제 도용 신고');
    await user.click(screen.getByRole('button', { name: '정지' }));

    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/users/u-1/suspension');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ action: 'SUSPEND', reason: '결제 도용 신고' });
  });

  it('정지된 회원은 언제·왜 막혔는지 보여 주고 해제를 보낸다', async () => {
    const user = userEvent.setup();
    render(
      <SuspendForm userId="u-1" userName="홍길동" suspendedAt="2026-09-01T00:00:00.000Z" suspendedReason="결제 도용 신고" />,
    );

    expect(screen.getByText(/사유: 결제 도용 신고/)).toBeTruthy();
    expect(screen.getByRole('form', { name: '홍길동 정지 해제' }).querySelector('time')?.getAttribute('dateTime'))
      .toBe('2026-09-01T00:00:00.000Z');
    await user.click(screen.getByRole('button', { name: '정지 해제' }));
    await waitFor(() => expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ action: 'RESTORE' }));
  });

  it('서버가 거절하면 그 말을 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue({ ok: false, json: () => Promise.resolve({ message: '운영진 계정은 슈퍼관리자만 정지할 수 있습니다.' }) });
    const user = userEvent.setup();
    render(<SuspendForm userId="u-1" userName="홍길동" suspendedAt="2026-09-01T00:00:00.000Z" suspendedReason={null} />);
    await user.click(screen.getByRole('button', { name: '정지 해제' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('슈퍼관리자'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('막힌 이유가 있으면 폼 대신 이유를 적는다', () => {
    render(<SuspendForm userId="u-1" userName="나" suspendedAt={null} suspendedReason={null} disabledReason="본인 계정" />);
    expect(screen.getByText('본인 계정')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
