// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh, push: vi.fn() }) }));

const { ArchiveProductButton } = await import('~/app/admin/products/archive-button');
const { RestoreProductButton } = await import('~/app/admin/products/restore-button');

/** 상품 보관 단추 — 무엇이 멈추고 남는지 말하고, 보관하면 보관함으로. 되돌리기는 한 번에 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('상품 보관 단추', () => {
  it('한 번 더 누르게 하고, 확인 단추에 초점을 옮기며 설명을 잇는다', async () => {
    const user = userEvent.setup();
    render(<ArchiveProductButton productId="p-1" unshipped={0} />);
    await user.click(screen.getByRole('button', { name: '보관' }));
    expect(fetchMock).not.toHaveBeenCalled();

    const group = screen.getByRole('group', { name: '상품 보관' });
    const confirm = screen.getByRole('button', { name: '보관하기' });
    expect(group).toContainElement(confirm);
    expect(confirm).toHaveFocus();
    const note = document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent ?? '';
    expect(note).toContain('매대·검색에서 빠지고');
    expect(note).toContain('되돌릴 수 있습니다');
    expect(note).not.toContain('아직 보내지 않은 주문');
  });

  it('보내지 않은 주문이 있으면 그 건수를 함께 말한다', async () => {
    const user = userEvent.setup();
    render(<ArchiveProductButton productId="p-1" unshipped={3} />);
    await user.click(screen.getByRole('button', { name: '보관' }));
    const confirm = screen.getByRole('button', { name: '보관하기' });
    expect(document.getElementById(confirm.getAttribute('aria-describedby')!)?.textContent).toContain('아직 보내지 않은 주문 3건은 보관해도 보내야 합니다.');
  });

  it('취소하면 처음 단추로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<ArchiveProductButton productId="p-1" unshipped={0} />);
    await user.click(screen.getByRole('button', { name: '보관' }));
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(screen.getByRole('button', { name: '보관' })).toBeInTheDocument();
    expect(screen.queryByRole('group')).toBeNull();
  });

  it('보관하면 보관함으로 가서 결과를 말하게 한다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'p-1' }));
    const user = userEvent.setup();
    render(<ArchiveProductButton productId="p-1" unshipped={0} />);
    await user.click(screen.getByRole('button', { name: '보관' }));
    await user.click(screen.getByRole('button', { name: '보관하기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/products?view=archived&archived=1'));
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/admin/products/p-1/archive');
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ action: 'ARCHIVE' });
  });

  it('실패하면 이유를 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '이미 보관한 상품입니다' }, { status: 409 }));
    const user = userEvent.setup();
    render(<ArchiveProductButton productId="p-1" unshipped={0} />);
    await user.click(screen.getByRole('button', { name: '보관' }));
    await user.click(screen.getByRole('button', { name: '보관하기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('이미 보관한'));
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('되돌리기 단추', () => {
  it('어느 상품을 되돌리는지 이름으로 읽히고, 누르면 한 번에 되돌려 결과를 말하게 한다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'p-1' }));
    const user = userEvent.setup();
    render(<RestoreProductButton productId="p-1" productName="울 코트" />);
    await user.click(screen.getByRole('button', { name: '울 코트 되돌리기' }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/products?view=archived&restored=1'));
    expect(refresh).toHaveBeenCalled();
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1].body)).toEqual({ action: 'RESTORE' });
  });

  it('막히면 이유를 알림으로 읽힌다', async () => {
    fetchMock.mockResolvedValue(Response.json({ message: '운영진이 보관한 상품은 운영진만 되돌릴 수 있습니다' }, { status: 403 }));
    const user = userEvent.setup();
    render(<RestoreProductButton productId="p-1" productName="울 코트" />);
    await user.click(screen.getByRole('button', { name: '울 코트 되돌리기' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('운영진만'));
    expect(replace).not.toHaveBeenCalled();
  });
});
