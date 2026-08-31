// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const back = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, back }) }));

const { ProductForm } = await import('~/app/admin/products/product-form');

const brands = [{ id: 'b-a', label: 'MOOR' }, { id: 'b-b', label: 'STUDIO NOON' }];
const categories = [{ id: 'c-1', label: '아우터 > 코트' }];

const initial = {
  slug: 'oat-coat', name: '오트 코트', description: '',
  brandId: 'b-a', categoryId: 'c-1',
  listPrice: '413000', salePrice: '289000', status: 'ACTIVE' as const,
};

function setup(mode: 'create' | 'edit' = 'edit') {
  return render(
    <ProductForm
      mode={mode}
      productId="p-1"
      brands={brands}
      categories={categories}
      initial={initial}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn());
});

describe('접근성', () => {
  it('모든 입력에 라벨이 붙어 있다', () => {
    setup();
    expect(screen.getByLabelText(/상품명/)).toBeDefined();
    expect(screen.getByLabelText(/슬러그/)).toBeDefined();
    expect(screen.getByLabelText('상품 설명')).toBeDefined();
    expect(screen.getByLabelText(/브랜드/)).toBeDefined();
    expect(screen.getByLabelText(/카테고리/)).toBeDefined();
    expect(screen.getByLabelText(/정가/)).toBeDefined();
    expect(screen.getByLabelText(/판매가/)).toBeDefined();
    expect(screen.getByLabelText('판매 상태')).toBeDefined();
  });

  it('필수 항목은 별표가 아니라 텍스트로도 알려 준다', () => {
    setup();
    // 색·기호로만 표시하면 스크린리더에는 존재하지 않는 것과 같다
    expect(screen.getByLabelText(/상품명.*\(필수\)/)).toBeDefined();
    expect(screen.getByLabelText(/브랜드.*\(필수\)/)).toBeDefined();
  });

  it('입력 묶음마다 legend 가 있다', () => {
    setup();
    expect(screen.getByRole('group', { name: '기본 정보' })).toBeDefined();
    expect(screen.getByRole('group', { name: '가격과 노출' })).toBeDefined();
  });
});

describe('할인율 미리보기', () => {
  it('정가와 판매가로 계산한 할인율을 보여 준다', () => {
    setup();
    // 413,000 → 289,000 은 30.02% 이고 내림해서 30%
    expect(screen.getByText('30% 할인으로 표시됩니다')).toBeDefined();
  });

  it('판매가를 비우면 정가 판매라고 안내한다', async () => {
    const user = userEvent.setup();
    setup();
    await user.clear(screen.getByLabelText(/판매가/));
    expect(screen.getByText('비워 두면 정가로 판매합니다')).toBeDefined();
  });
});

describe('제출', () => {
  it('수정은 PATCH 로 보내고 빈 판매가는 null 로 바꾼다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'p-1' }), { status: 200 }),
    );
    setup('edit');

    await user.clear(screen.getByLabelText(/판매가/));
    await user.click(screen.getByRole('button', { name: '변경 사항 저장' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/admin/products/p-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string).salePrice).toBeNull();
  });

  it('등록은 POST 로 보내고 새 상품 상세로 이동한다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ id: 'p-new' }), { status: 201 }),
    );
    setup('create');

    await user.click(screen.getByRole('button', { name: '상품 등록' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/admin/products/p-new'));
    expect((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('서버가 준 필드 에러를 해당 입력에 붙인다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          code: 'VALIDATION_FAILED',
          message: '입력값을 확인해 주세요.',
          fields: [{ path: 'slug', message: '영소문자·숫자·하이픈만 쓸 수 있습니다' }],
        }),
        { status: 400 },
      ),
    );
    setup();

    await user.click(screen.getByRole('button', { name: '변경 사항 저장' }));

    const slug = await screen.findByLabelText(/슬러그/);
    await waitFor(() => expect(slug.getAttribute('aria-invalid')).toBe('true'));
    expect(screen.getByText('영소문자·숫자·하이픈만 쓸 수 있습니다')).toBeDefined();
    expect(push).not.toHaveBeenCalled();
  });

  it('저장 실패는 role=alert 로 즉시 읽힌다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ code: 'SLUG_TAKEN', message: '이미 사용 중인 슬러그입니다' }), {
        status: 409,
      }),
    );
    setup();

    await user.click(screen.getByRole('button', { name: '변경 사항 저장' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toBe('이미 사용 중인 슬러그입니다');
  });

  it('네트워크가 끊겨도 화면이 죽지 않는다', async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    setup();

    await user.click(screen.getByRole('button', { name: '변경 사항 저장' }));

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크');
    // 실패한 뒤에도 다시 누를 수 있어야 한다
    expect(screen.getByRole('button', { name: '변경 사항 저장' }).hasAttribute('disabled')).toBe(false);
  });
});
