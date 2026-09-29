// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { ReceiveReturnButton } = await import('~/app/admin/orders/[orderNo]/return-actions');

/**
 * 가맹점이 돌아온 물건의 도착을 확인하는 단추.
 *
 * **끝났다는 말을 단추 곁에 두면 안 된다.** 확인이 기록되면 화면을 다시 그리는데, 그때 이 단추 자리가
 * 통째로 사라진다 — 곁에 둔 말도 함께 사라져서 누른 사람에게는 아무 일도 안 일어난 것처럼 보인다.
 * 그래서 방금 한 일을 **주소에 싣고** 화면이 말한다(손님 화면의 구매확정과 같은 방식이다).
 */

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ receivedAt: '2026-09-29' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const draw = () => render(<ReceiveReturnButton orderNo="20260901-0000001" />);

describe('도착 확인', () => {
  it('누르면 회수 확인을 보낸다', async () => {
    draw();
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/orders/20260901-0000001/return');
    expect(JSON.parse(init.body)).toEqual({ action: 'RECEIVE' });
  });

  it('방금 한 일을 주소에 싣고 다시 읽는다 — 단추가 사라져도 말은 남는다', async () => {
    draw();
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    await waitFor(() =>
      expect(router.replace).toHaveBeenCalledWith(
        '/admin/orders/20260901-0000001?done=received',
        { scroll: false },
      ),
    );
    expect(router.refresh).toHaveBeenCalled();
  });

  it('막히면 이유를 그 자리에서 말하고, 화면을 다시 그리지 않는다', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: '승인한 신청만 회수를 확인할 수 있습니다.' }), { status: 409 }),
    );
    draw();
    await userEvent.click(screen.getByRole('button', { name: '물건 도착 확인' }));

    expect((await screen.findByRole('alert')).textContent).toContain('승인한 신청만');
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('누르는 동안에는 또 눌리지 않는다', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { release = resolve; }));
    draw();

    const button = screen.getByRole('button', { name: '물건 도착 확인' });
    await userEvent.click(button);

    expect(screen.getByRole('button', { name: '확인하는 중…' })).toHaveAttribute('aria-disabled', 'true');
    release(new Response(JSON.stringify({}), { status: 200 }));
  });
});
