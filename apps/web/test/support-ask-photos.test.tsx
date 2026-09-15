// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));

const { SupportAskForm } = await import('~/components/support-ask-form');

/** 1:1 문의 사진 — 저장소가 있을 때만 칸을 내밀고, 3장까지, 빼기, multipart 로 보내고 비운다 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn((f: File) => `blob:${f.name}`), revokeObjectURL: vi.fn() }));
});

const file = (name: string) => new File(['x'], name, { type: 'image/png' });

describe('1:1 문의 사진', () => {
  it('저장소가 없으면 사진 칸을 내밀지 않는다', () => {
    render(<SupportAskForm />);
    expect(screen.queryByLabelText('사진 (선택)')).toBeNull();
  });

  it('고른 사진을 미리 보여 주고 뺄 수 있다 — 3장을 넘기면 막는다', async () => {
    const user = userEvent.setup();
    render(<SupportAskForm photosEnabled />);
    const input = screen.getByLabelText('사진 (선택)');
    expect(input).toHaveAccessibleDescription(/최대 3장/);
    await user.upload(input, [file('a.png'), file('b.png')]);
    const picked = screen.getByRole('list', { name: '고른 사진' });
    expect(within(picked).getAllByRole('img')).toHaveLength(2);

    await user.upload(input, [file('c.png'), file('d.png')]);
    expect(screen.getByRole('alert')).toHaveTextContent('사진은 3장까지 보낼 수 있습니다.');
    expect(within(picked).getAllByRole('img')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: '고른 사진 1 빼기' }));
    expect(within(screen.getByRole('list', { name: '고른 사진' })).getAllByRole('img')).toHaveLength(1);
  });

  it('사진이 있으면 multipart 로 보내고, 보내면 비운다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'q-1' }, { status: 201 }));
    const user = userEvent.setup();
    render(<SupportAskForm photosEnabled />);
    await user.type(screen.getByRole('textbox'), '받은 상품이 파손되어 왔습니다.');
    await user.upload(screen.getByLabelText('사진 (선택)'), [file('broken.png')]);
    await user.click(screen.getByRole('button', { name: /보내기|문의/ }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/inquiries');
    const body = init.body as FormData;
    expect(body).toBeInstanceOf(FormData);
    expect(JSON.parse(body.get('data') as string)).toMatchObject({ topic: 'DELIVERY', isPrivate: true });
    expect(body.getAll('images')).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('list', { name: '고른 사진' })).toBeNull());
  });

  it('사진이 없으면 지금처럼 JSON', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'q-1' }, { status: 201 }));
    const user = userEvent.setup();
    render(<SupportAskForm photosEnabled />);
    await user.type(screen.getByRole('textbox'), '배송이 언제 오나요?');
    await user.click(screen.getByRole('button', { name: /보내기|문의/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ 'content-type': 'application/json' });
  });
});
