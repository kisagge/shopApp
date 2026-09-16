// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
// 미리보기는 모양만 본다 — next/image 의 주소 검사는 이 검사의 관심이 아니다
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

const { BrandLogoForm } = await import('~/app/admin/brands/brand-logo-form');

/**
 * 브랜드 로고 칸 — 매장은 로고를 그리는데 올리는 곳이 없었다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ logoUrl: '/x.png', replaced: false }, { status: 201 }));
});

const png = () => new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

describe('로고가 없을 때', () => {
  it('없다고 말하고, 이름 붙은 파일 칸과 올리기 단추를 준다', () => {
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl={null} storageConfigured />);

    expect(screen.getByText('로고가 없어 매장에는 이름만 뜹니다.')).toBeTruthy();
    const input = screen.getByLabelText('MOOR 로고 파일');
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp,image/avif');
    // 형식·크기 안내가 입력칸에 묶여 있다
    expect(document.getElementById(input.getAttribute('aria-describedby')!)?.textContent).toContain('5MB 이하');
    expect(screen.getByRole('button', { name: '로고 올리기' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '로고 떼기' })).toBeNull();
  });

  it('파일을 고르지 않고 누르면 알리고 보내지 않는다', async () => {
    const user = userEvent.setup();
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl={null} storageConfigured />);

    await user.click(screen.getByRole('button', { name: '로고 올리기' }));

    expect(screen.getByRole('alert').textContent).toBe('로고 파일을 골라 주세요.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('고르고 올리면 파일을 보내고, 올렸다고 말하고, 화면을 다시 읽는다', async () => {
    const user = userEvent.setup();
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl={null} storageConfigured />);

    await user.upload(screen.getByLabelText('MOOR 로고 파일'), png());
    await user.click(screen.getByRole('button', { name: '로고 올리기' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('로고를 올렸습니다'));
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/brands/b-1/logo');
    expect(init.method).toBe('POST');
    expect((init.body as FormData).get('file')).toBeInstanceOf(File);
    expect(refresh).toHaveBeenCalled();
  });

  it('실패하면 서버가 준 까닭을 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ code: 'CONTENT_MISMATCH', message: '파일 내용이 이미지가 아닙니다' }, { status: 400 }));
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl={null} storageConfigured />);

    await user.upload(screen.getByLabelText('MOOR 로고 파일'), png());
    await user.click(screen.getByRole('button', { name: '로고 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toBe('파일 내용이 이미지가 아닙니다');
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('로고가 있을 때', () => {
  it('매장과 같은 크기로 보여 주고, 바꾸기와 떼기를 준다', () => {
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl="/moor.png" storageConfigured />);

    expect(screen.getByRole('img', { name: 'MOOR 로고' }).getAttribute('src')).toBe('/moor.png');
    expect(screen.getByRole('button', { name: '로고 바꾸기' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '로고 떼기' })).toBeTruthy();
  });

  it('떼면 지우라고 보내고 이름만 뜬다고 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ removed: true }));
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl="/moor.png" storageConfigured />);

    await user.click(screen.getByRole('button', { name: '로고 떼기' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('로고를 뗐습니다'));
    expect(fetchMock.mock.calls[0]![1].method).toBe('DELETE');
  });
});

describe('저장소가 없을 때', () => {
  it('올리는 칸을 잠그고 까닭을 말한다 — 누르고 나서 알게 하지 않는다', () => {
    render(<BrandLogoForm brandId="b-1" brandName="MOOR" logoUrl={null} storageConfigured={false} />);

    expect(screen.getByRole('alert').textContent).toContain('이미지 저장소가 설정되지 않아');
    expect(screen.getByLabelText<HTMLInputElement>('MOOR 로고 파일').disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '로고 올리기' }).disabled).toBe(true);
  });
});
