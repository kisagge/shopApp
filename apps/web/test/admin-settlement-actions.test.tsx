// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CloseButton, PayButton, HoldButton } = await import(
  '~/app/admin/settlements/settlement-actions'
);

/**
 * 정산 — 확정·지급·보류.
 *
 * **셋 다 되돌리기 어려운 일인데 단위 검사가 한 줄도 없었다.** 확정은 금액을 못
 * 박고(그 뒤로 다시 계산되지 않는다), 지급은 돈을 내보내고, 보류는 가맹점이 보는
 * 까닭을 남긴다. 그래서 확정은 한 번 묻고, 보류는 까닭 없이 못 누른다.
 *
 * 같은 표에 가맹점마다 같은 이름의 단추가 여럿 떠서, 단추 이름에 가맹점이
 * 들어간다 — 낭독기로는 그게 유일한 구별이다. 이름을 **구분자에 느슨하게** 보는
 * 까닭: 이름 계산이 자식 글자를 이을 때 공백을 넣을지가 구현마다 다르다(브라우저는
 * 넣고, 여기 쓰는 계산기는 다듬어 붙인다). 이름에 가맹점이 들어가는지가 뜻이고
 * 그 사이 공백 한 칸은 아니다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;

function held() {
  let give!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    give = resolve;
  });
  return { promise, give };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(200, { created: 3, updated: 1, skipped: [] }));
});

describe('기간 확정 — 한 번 묻는다', () => {
  const open = async () => {
    render(<CloseButton yearMonth="2026-10" />);
    await userEvent.click(screen.getByRole('button', { name: '2026-10 정산 확정' }));
  };

  it('바로 확정하지 않고 되돌릴 수 없다는 말을 먼저 보여 준다', async () => {
    await open();

    expect(screen.getByText(/확정 후에는 금액이 다시 계산되지 않습니다/)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('취소하면 묻기 전으로 돌아간다', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '2026-10 정산 확정' })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('확정하면 달을 실어 보내고 신규·재계산 건수를 말한다', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        '2026-10 정산을 확정했습니다 — 신규 3건, 재계산 1건.',
      ),
    );
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/settlements/close');
    expect(sent()).toEqual({ yearMonth: '2026-10' });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('건드리지 않은 건이 있으면 몇 건인지 덧붙인다 — 수가 모자라 보이면 다시 누른다', async () => {
    fetchMock.mockResolvedValue(json(200, { created: 1, updated: 0, skipped: ['무어', '라이프'] }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe(
        '2026-10 정산을 확정했습니다 — 신규 1건, 재계산 0건. 이미 확정·지급된 2건은 건드리지 않았습니다.',
      ),
    );
  });

  it('건드리지 않은 건이 없으면 그 말을 안 붙인다', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument());
    expect(screen.getByRole('status').textContent).not.toContain('건드리지 않았습니다');
  });

  it('실패하면 창구의 말을, 없으면 확정 쪽 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 확정된 달입니다.' }));
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('이미 확정된 달입니다.'));
    expect(refresh).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(json(500, {}));
    await userEvent.click(screen.getByRole('button', { name: '2026-10 정산 확정' }));
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('확정하지 못했습니다.'));
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('네트워크 오류로 확정하지 못했습니다.'),
    );
  });

  it('보내는 중에는 확정 단추가 잠긴다 — 묻는 줄은 사라진다', async () => {
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    await open();
    await userEvent.click(screen.getByRole('button', { name: '확정' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '확정 중…' })).toBeDisabled());
    expect(screen.queryByText(/확정 후에는 금액이/)).toBeNull();

    await act(async () => {
      wait.give(json(200, { created: 0, updated: 0, skipped: [] }));
    });
  });
});

describe('지급 집행', () => {
  it('지급할 수 없으면 단추 대신 까닭만 둔다 — 누를 수 있게 두면 왜 안 되는지 모른다', () => {
    render(<PayButton settlementId="s-1" merchantName="무어" disabledReason="확정 전입니다" />);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('확정 전입니다')).toBeInTheDocument();
  });

  it('단추 이름에 가맹점이 들어간다 — 표에 같은 이름의 단추가 여럿이다', () => {
    render(<PayButton settlementId="s-1" merchantName="무어" />);

    expect(screen.getByRole('button', { name: /무어\s*지급/ })).toBeInTheDocument();
  });

  it('누르면 그 정산에만 보내고 화면을 다시 그린다', async () => {
    fetchMock.mockResolvedValue(json(200, { id: 's-1' }));
    render(<PayButton settlementId="s-1" merchantName="무어" />);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*지급/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/admin/settlements/s-1/pay', { method: 'POST' });
  });

  it('실패하면 돈이 나간 것처럼 보이지 않게 까닭을 띄운다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '보류 중인 정산입니다.' }));
    render(<PayButton settlementId="s-1" merchantName="무어" />);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*지급/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('보류 중인 정산입니다.'));
    expect(refresh).not.toHaveBeenCalled();
  });

  it('창구가 까닭을 안 적어 보내면 지급 쪽 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<PayButton settlementId="s-1" merchantName="무어" />);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*지급/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('지급 처리하지 못했습니다.'),
    );
  });

  it('네트워크 오류도 지급 쪽 말로 한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<PayButton settlementId="s-1" merchantName="무어" />);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*지급/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('네트워크 오류로 지급 처리하지 못했습니다.'),
    );
  });
});

describe('지급 보류 · 해제', () => {
  const hold = (held = false) =>
    render(<HoldButton settlementId="s-1" merchantName="무어" held={held} />);

  const openPanel = async () => {
    hold();
    await userEvent.click(screen.getByRole('button', { name: /무어\s*보류$/ }));
    return screen.getByRole<HTMLFormElement>('form', { name: '무어 정산 지급 보류' });
  };

  it('닫혀 있을 때는 무엇을 여는 단추인지 밝힌다', () => {
    hold();
    const trigger = screen.getByRole('button', { name: /무어\s*보류$/ });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
  });

  it('열면 초점이 폼으로 간다 — 칸으로 바로 가면 무엇이 열렸는지 안 들린다', async () => {
    const form = await openPanel();

    expect(document.activeElement).toBe(form);
    expect(screen.getByText('가맹점 정산 화면에도 보입니다.')).toBeInTheDocument();
  });

  it('까닭 없이는 창구에 가지도 않는다 — 가맹점이 그 까닭을 본다', async () => {
    const form = await openPanel();
    await userEvent.type(screen.getByLabelText('보류 까닭'), '   ');
    await act(async () => {
      form.requestSubmit();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe(
      '보류 까닭을 적어 주세요. 가맹점도 이 까닭을 봅니다.',
    );
    expect(screen.getByLabelText('보류 까닭')).toHaveAttribute('aria-invalid', 'true');
  });

  it('까닭을 적으면 다듬어 보내고 폼이 닫힌다', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'HELD' }));
    await openPanel();
    await userEvent.type(screen.getByLabelText('보류 까닭'), '  정산 금액 확인 중  ');
    await userEvent.click(screen.getByRole('button', { name: '보류하기' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/settlements/s-1/hold');
    expect(sent()).toEqual({ hold: true, reason: '정산 금액 확인 중' });
    expect(screen.getByRole('button', { name: /무어\s*보류$/ })).toBeInTheDocument();
  });

  it('취소하면 초점이 단추로 돌아온다', async () => {
    const form = await openPanel();
    await act(async () => {
      form.requestSubmit();
    });
    expect(screen.getByRole('alert')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(document.activeElement).toBe(screen.getByRole('button', { name: /무어\s*보류$/ }));
  });

  it('취소하고 다시 열면 지난 오류가 없다 — 닫는 것만으로는 안 지워진다', async () => {
    /*
     * **닫으면 오류 자리가 통째로 사라지므로, 닫은 뒤를 보는 단정은 늘 참이다.**
     * 지워졌는지는 다시 열어 봐야 안다 — 안 지우면 아무 짓도 안 한 폼에 지난
     * 까닭이 붉게 떠 있다.
     */
    const form = await openPanel();
    await act(async () => {
      form.requestSubmit();
    });
    await userEvent.click(screen.getByRole('button', { name: '취소' }));
    await userEvent.click(screen.getByRole('button', { name: /무어\s*보류$/ }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('실패하면 폼을 열어 둔 채 까닭을 띄운다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 지급된 정산입니다.' }));
    await openPanel();
    await userEvent.type(screen.getByLabelText('보류 까닭'), '확인 중');
    await userEvent.click(screen.getByRole('button', { name: '보류하기' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('이미 지급된 정산입니다.'),
    );
    expect(screen.getByLabelText('보류 까닭')).toHaveValue('확인 중');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('보류 중이면 해제 단추 하나뿐이고 까닭을 묻지 않는다 — 푸는 것은 한 번에 된다', async () => {
    fetchMock.mockResolvedValue(json(200, { status: 'CLOSED' }));
    hold(true);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*보류\s*해제/ }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ hold: false });
  });

  it('해제가 실패하면 그 자리에 까닭을 띄운다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    hold(true);
    await userEvent.click(screen.getByRole('button', { name: /무어\s*보류\s*해제/ }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
  });
});
