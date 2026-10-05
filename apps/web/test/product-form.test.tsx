// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const back = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh, back }) }));

const { ProductForm } = await import('~/app/admin/products/product-form');

const brands = [{ id: 'b-a', label: 'MOOR' }, { id: 'b-b', label: 'STUDIO NOON' }];
const categories = [{ id: 'c-1', label: '아우터 > 코트' }];

const initial = {
  slug: 'oat-coat', name: '오트 코트', description: '',
  brandId: 'b-a', categoryId: 'c-1',
  listPrice: '413000', salePrice: '289000', status: 'ACTIVE' as const,
};

function setup(mode: 'create' | 'edit' = 'edit', over: Record<string, unknown> = {}) {
  return render(
    <ProductForm
      mode={mode}
      productId="p-1"
      brands={brands}
      categories={categories}
      initial={initial}
      canPublish
      {...over}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn<(...a: any[]) => any>());
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

describe('게시 권한이 없는 사람', () => {
  it('매대에 보이는 상태를 고를 수 없다', () => {
    /*
     * 서버도 같은 검사를 하므로 여기서는 고를 수 없는 것을 감출 뿐이다.
     * 누를 수 있게 두면 눌러 본 뒤에야 안 된다는 것을 안다.
     */
    setup('create', { canPublish: false, initial: { ...initial, status: 'DRAFT' as const } });

    const select = screen.getByLabelText('판매 상태');
    const options = Array.from(select.querySelectorAll('option')).map((o) => o.value);

    expect(options).not.toContain('ACTIVE');
    expect(options).not.toContain('SOLD_OUT');
  });

  it('대신 검수를 요청할 수 있다고 알려 준다', () => {
    setup('create', { canPublish: false, initial: { ...initial, status: 'DRAFT' as const } });

    const options = Array.from(
      screen.getByLabelText('판매 상태').querySelectorAll('option'),
    ).map((o) => o.value);
    expect(options).toContain('PENDING_REVIEW');
    expect(screen.getByText(/운영진이 확인한 뒤에 됩니다/)).toBeDefined();
  });

  it('게시 권한이 있으면 모두 고를 수 있다', () => {
    setup();

    const options = Array.from(
      screen.getByLabelText('판매 상태').querySelectorAll('option'),
    ).map((o) => o.value);
    expect(options).toContain('ACTIVE');
  });
});

describe('반려 사유', () => {
  it('폼 안에서 보여 준다 — 고치는 동안 보여야 한다', () => {
    setup('edit', { rejection: '사진이 흐립니다' });

    expect(screen.getByRole('heading', { name: '게시가 반려되었습니다' })).toBeDefined();
    expect(screen.getByText('사진이 흐립니다')).toBeDefined();
  });

  it('반려된 적이 없으면 아무것도 그리지 않는다', () => {
    setup();
    expect(screen.queryByRole('heading', { name: '게시가 반려되었습니다' })).toBeNull();
  });
});

/**
 * **돌려받을 곳이 없는 브랜드.**
 *
 * 반품지가 없는 판매처의 상품은 매대에 올릴 수 없다(서버 assertReturnAddress). 고를 수 있게 두면 폼을
 * 다 채워 저장한 뒤에야 안 된다는 것을 알게 되고, 그때 화면은 "반품지를 등록해 주세요" 라고만 말한다 —
 * 어디서 등록하는지는 말해 주지 않는다.
 */
describe('반품지가 없는 브랜드', () => {
  const sellable = [
    { id: 'b-a', label: 'MOOR', merchantId: 'm-a', canSell: true },
    { id: 'b-b', label: 'STUDIO NOON', merchantId: 'm-b', canSell: false },
    { id: 'b-own', label: 'PLAIN', merchantId: null, canSell: false },
  ];
  const statusValues = () =>
    Array.from(screen.getByLabelText('판매 상태').querySelectorAll('option')).map((o) => o.value);

  it('매대로 가는 상태를 내놓지 않는다 — 검수 대기도 아니다', () => {
    setup('create', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-b', status: 'DRAFT' as const },
    });

    expect(statusValues()).toEqual(['DRAFT', 'HIDDEN']);
  });

  it('어디서 등록하는지까지 말해 준다', () => {
    setup('create', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-b', status: 'DRAFT' as const },
    });

    expect(screen.getByText(/반품지가 없어 매대에 올릴 수 없습니다/)).toBeDefined();
    expect(screen.getByRole('link', { name: '등록해 주세요' }).getAttribute('href'))
      .toBe('/admin/merchants/m-b/return-address');
  });

  /** 자사 상품을 받는 플랫폼 반품지는 가게 전체의 약속이라 배송 정책과 같은 자리에 있다 */
  it('자사 브랜드면 배송비 화면으로 보낸다', () => {
    setup('create', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-own', status: 'DRAFT' as const },
    });

    expect(screen.getByRole('link', { name: '등록해 주세요' }).getAttribute('href'))
      .toBe('/admin/shipping');
  });

  it('안내는 상태 선택과 이어져 있다 — 낭독기가 까닭을 함께 읽는다', () => {
    setup('create', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-b', status: 'DRAFT' as const },
    });

    const select = screen.getByLabelText('판매 상태');
    const hintId = select.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId!)?.textContent).toContain('반품지');
  });

  /**
   * **지금 값은 남긴다.** 이 규칙이 생기기 전에 올라간 상품을 고치러 온 사람에게서 그 상태를 빼앗으면,
   * 설명 한 줄을 고치고 저장하는 순간 상품이 조용히 매대에서 내려간다.
   */
  it('이미 팔고 있는 상품의 상태는 남겨 둔다', () => {
    setup('edit', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-b', status: 'ACTIVE' as const },
    });

    expect(statusValues()).toContain('ACTIVE');
    expect(statusValues()).not.toContain('PENDING_REVIEW');
  });

  it('반품지가 있는 브랜드로 바꾸면 다시 고를 수 있다', async () => {
    setup('create', {
      brands: sellable,
      initial: { ...initial, brandId: 'b-b', status: 'DRAFT' as const },
    });

    await userEvent.selectOptions(screen.getByLabelText(/브랜드/), 'b-a');

    await waitFor(() => expect(statusValues()).toContain('ACTIVE'));
    expect(screen.queryByText(/반품지가 없어/)).toBeNull();
  });

  it('팔 수 있는지 안 알려 주면 막지 않는다 — 막는 것은 서버의 일이다', () => {
    setup('create', { initial: { ...initial, status: 'DRAFT' as const } });

    expect(statusValues()).toContain('ACTIVE');
  });
});
