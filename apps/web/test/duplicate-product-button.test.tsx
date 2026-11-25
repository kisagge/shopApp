// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));

const { DuplicateProductButton } = await import('~/app/admin/products/duplicate-button');

/** 상품 복제 단추 — 누르기 전에 무엇이 따라가는지 말하고, 만들면 사본 화면으로 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('상품 복제 단추', () => {
  it('한 번 더 누르게 하고, 그 단추에 재고 0·임시저장 설명을 잇는다', async () => {
    const user = userEvent.setup();
    render(<DuplicateProductButton productId="p-1" />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    expect(fetchMock).not.toHaveBeenCalled();

    const confirm = screen.getByRole('button', { name: '사본 만들기' });
    const note = document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent ?? '';
    expect(note).toContain('임시저장');
    expect(note).toContain('재고는 0');
  });

  it('취소를 누르면 묻기 전으로 돌아오고 아무것도 보내지 않는다', async () => {
    /*
     * 확인 단계에서 빠져나가는 단추를 아무도 안 누르고 있었다. 깨지면 운영자는
     * **만들거나 새로 고치는 두 길**밖에 없고, 임시저장 사본이 쌓인다.
     */
    const user = userEvent.setup();
    render(<DuplicateProductButton productId="p-1" />);
    await user.click(screen.getByRole('button', { name: '복제' }));

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '복제' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사본 만들기' })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('만들어지면 사본 화면으로 간다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'p-copy' }, { status: 201 }));
    const user = userEvent.setup();
    render(<DuplicateProductButton productId="p-1" />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await user.click(screen.getByRole('button', { name: '사본 만들기' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/products/p-copy'));
    expect(fetchMock.mock.calls[0]).toEqual(['/api/admin/products/p-1/duplicate', { method: 'POST' }]);
  });

  it('실패하면 이유를 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '상품을 찾을 수 없습니다.' }, { status: 404 }));
    const user = userEvent.setup();
    render(<DuplicateProductButton productId="p-1" />);
    await user.click(screen.getByRole('button', { name: '복제' }));
    await user.click(screen.getByRole('button', { name: '사본 만들기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('찾을 수 없습니다'));
    expect(push).not.toHaveBeenCalled();
  });
});
