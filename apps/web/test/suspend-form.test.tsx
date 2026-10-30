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

describe('펼침 판의 초점', () => {
  it('여는 단추가 펼침 상태와 가리키는 판을 말한다', () => {
    render(<SuspendForm userId="u-1" userName="홍길동" suspendedAt={null} suspendedReason={null} />);

    const trigger = screen.getByRole('button', { name: '이용 정지' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.getAttribute('aria-controls')).toBeTruthy();
  });

  it('닫으면 눌렀던 단추로 초점이 돌아온다', async () => {
    /*
     * 열 때만 챙기고 닫을 때는 아무것도 하지 않았다 — 취소를 누르면 초점이 `<body>` 로 떨어져
     * 키보드 사용자는 탭을 문서 맨 앞부터 다시 눌러야 했다.
     */
    const user = userEvent.setup();
    render(<SuspendForm userId="u-1" userName="홍길동" suspendedAt={null} suspendedReason={null} />);

    await user.click(screen.getByRole('button', { name: '이용 정지' }));
    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '이용 정지' })).toHaveFocus();
  });
});

describe('이용 정지 폼', () => {
  it('정지는 사유를 적어야 누를 수 있고, 로그인이 끊긴다는 설명이 입력에 이어진다', async () => {
    const user = userEvent.setup();
    render(<SuspendForm userId="u-1" userName="홍길동" suspendedAt={null} suspendedReason={null} />);

    await user.click(screen.getByRole('button', { name: '이용 정지' }));
    const form = screen.getByRole('form', { name: '홍길동 이용 정지' });
    const reason = screen.getByLabelText(/정지 사유/);
    /*
     * **초점은 칸이 아니라 판으로 간다.** 누른 단추가 사라지므로 갈 곳을 정해 줘야 하는데,
     * 사유 칸을 짚으면 낭독기가 그 칸 이름만 읽고 무엇이 열렸는지는 말하지 않는다. 판에 이름이
     * 달려 있어 "홍길동 이용 정지, 양식" 부터 읽는다 — 저장소의 다른 펼침 판들과 같은 규칙이다.
     */
    expect(form).toHaveFocus();
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

describe('이용 정지 폼 — 서버가 JSON 이 아닌 오류를 줄 때', () => {
  it('네트워크 오류가 아니라 처리 실패로 말한다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const user = userEvent.setup();
    render(<SuspendForm userId="u-1" userName="김손님" suspendedAt="2026-09-01T00:00:00.000Z" suspendedReason="x" />);
    await user.click(screen.getByRole('button', { name: /정지 해제/ }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('처리하지 못했습니다.'));
  });
});
