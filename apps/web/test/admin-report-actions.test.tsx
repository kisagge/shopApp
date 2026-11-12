// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { ReportActions } = await import('~/app/admin/product-reports/report-actions');

/**
 * 신고된 상품을 처리하는 단추. **문장 스물여섯이 전부 안 돌았다.**
 *
 * 두 단추가 한 뼘 거리에 붙어 있는데 무게가 아주 다르다 — "문제없음" 은 아무것도
 * 멈추지 않고, "내리기" 는 **남의 매출을 멈춘다.** 되돌리는 길은 있지만 그 사이
 * 상품은 매대에서 사라진다. 그래서 한쪽만 한 번 더 묻는다.
 *
 * 묻는 판이 열리면 단추가 사라지므로 초점을 판으로 옮긴다. 그 규칙 자체는
 * `focus-hooks` 가 보고, 여기서는 **이 화면이 그 훅에 무엇을 걸었는지**를 본다.
 */

const PRODUCT = { productId: 'p-1', productName: '울 코트' };

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { resolution: string };

function held() {
  let give!: (response: Response) => void;
  const promise = new Promise<Response>((resolve) => {
    give = resolve;
  });
  return { promise, give };
}

const panel = () => screen.queryByRole('group', { name: '울 코트 보관할까요?' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(200, { ok: true }));
});

describe('문제없음 — 바로 누른다', () => {
  it('묻지 않고 그대로 보낸다 — 아무것도 멈추지 않는 쪽이다', async () => {
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/product-reports/p-1');
    expect(fetchMock.mock.calls[0]![1].method).toBe('PATCH');
    expect(sent()).toEqual({ resolution: 'kept' });
    expect(panel()).toBeNull();
  });

  it('실패하면 단추 자리에서 까닭을 말한다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 처리된 신고입니다.' }));
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('이미 처리된 신고입니다.'));
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '문제없음' })).toBeInTheDocument();
  });
});

describe('내리기 — 한 번 더 묻는다', () => {
  const ask = async () => {
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '내리기' }));
  };

  it('누르는 것만으로는 아무것도 안 보낸다', async () => {
    await ask();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(panel()).toBeInTheDocument();
  });

  it('무엇을 묻는지 상품 이름으로 밝히고, 되돌릴 수 있다고 적는다', async () => {
    await ask();

    expect(panel()).toHaveAccessibleName('울 코트 보관할까요?');
    expect(screen.getByText('매대에서 내립니다. 되돌릴 수 있습니다.')).toBeInTheDocument();
  });

  it('열면 초점이 판으로 간다 — 단추가 사라지므로 초점을 두고 올 수 없다', async () => {
    await ask();

    expect(document.activeElement).toBe(panel());
  });

  it('무엇을 여는 단추인지 미리 밝힌다', () => {
    render(<ReportActions {...PRODUCT} />);
    const trigger = screen.getByRole('button', { name: '내리기' });

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls');
  });

  it('그만두면 단추로 돌아오고 초점도 그 단추로 온다', async () => {
    await ask();
    await userEvent.click(screen.getByRole('button', { name: '그만' }));

    const trigger = screen.getByRole('button', { name: '내리기' });
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('판에서 누르면 보관으로 보내고, 끝나면 판이 닫힌다', async () => {
    await ask();
    await userEvent.click(screen.getByRole('button', { name: '내리기' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(sent()).toEqual({ resolution: 'archived' });
    expect(panel()).toBeNull();
  });

  it('실패하면 판을 열어 둔 채 까닭을 말한다 — 다시 고르게 한다', async () => {
    fetchMock.mockResolvedValue(json(403, { message: '권한이 없습니다.' }));
    await ask();
    await userEvent.click(screen.getByRole('button', { name: '내리기' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('권한이 없습니다.'));
    expect(panel()).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('실패를 읽는 법', () => {
  it('창구가 까닭을 안 적어 보내면 우리 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
  });

  it('502 가 HTML 로 와도 네트워크 오류로 오해하지 않는다', async () => {
    /*
     * 앞단이 끼어들면 JSON 이 아닌 몸통이 온다. 그걸 읽다 던지면 창구까지 갔다
     * 왔는데도 "길이 끊겼다" 고 말하게 된다 — 운영자가 볼 것은 서버의 상태다.
     */
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
  });

  it('창구에 닿지도 못하면 같은 문구로 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<ReportActions {...PRODUCT} />);
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
  });
});

describe('두 번 누르기', () => {
  it('보내는 중에 또 눌러도 한 번만 간다 — 단추가 눌리는 것을 막지 않는다', async () => {
    /*
     * `Button` 은 `disabled` 대신 `aria-disabled` 를 쓴다(못 누르는 단추는 초점을
     * 못 받아 왜 못 누르는지 들리지 않는다). 그래서 눌리기는 한다 — 막는 것은
     * 핸들러 첫 줄의 `if (pending) return` 하나뿐이다.
     */
    const wait = held();
    fetchMock.mockReturnValue(wait.promise);
    render(<ReportActions {...PRODUCT} />);

    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));
    const busy = screen.getByRole('button', { name: '처리 중…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();

    await userEvent.click(busy);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      wait.give(json(200, {}));
    });
  });
});
