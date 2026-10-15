// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { BRAND_NAME_MAX, BRAND_SLUG_MAX, BRAND_SLUG_MIN, BRAND_SLUG_PATTERN } from '@shop/core';
import { NewBrandForm } from '~/app/admin/brands/new-brand-form';
import { BrandRowForm } from '~/app/admin/brands/brand-row-form';

/**
 * 브랜드 등록·수정 — **매대에 걸리는 간판과 그 주소.**
 *
 * 둘 다 검사가 한 줄도 없었다. 계약을 먼저 읽고 들어갔더니 같은 자리가 둘이었다.
 *
 * **상한과 모양을 손으로 적어 두고 있었다.** core 가 쥔 값(`BRAND_SLUG_MAX`·
 * `BRAND_SLUG_PATTERN`)으로 계약이 거절하는데, 화면은 60 과 정규식을 따로 적었다. 한쪽을
 * 고치는 날 둘이 갈리고, 그때 화면은 받아 주고 서버는 거절한다.
 *
 * **최소 두 자를 화면이 말하지 않았다.** `a` 한 자는 `pattern` 과 `required` 를 통과해 서버까지
 * 갔다가 거절당했다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

/**
 * **상한은 한 곳에서 온다.** 화면이 따로 적으면 갈린다 — 이미지 상한이 같은 까닭으로
 * core 에서 뽑도록 바뀌었다.
 */
describe('칸이 지키는 규칙', () => {
  const openNew = async () => {
    render(<NewBrandForm />);
    await userEvent.click(screen.getByRole('button', { name: '자사 브랜드 등록' }));
  };

  it('주소 칸이 core 의 모양·길이를 그대로 쓴다', async () => {
    await openNew();

    const slug = screen.getByLabelText(/^주소/);
    expect(slug).toHaveAttribute('pattern', BRAND_SLUG_PATTERN.source);
    expect(slug).toHaveAttribute('maxlength', String(BRAND_SLUG_MAX));
    expect(slug).toHaveAttribute('minlength', String(BRAND_SLUG_MIN));
  });

  it('이름 칸도 core 의 길이를 쓴다', async () => {
    await openNew();

    expect(screen.getByLabelText('이름')).toHaveAttribute('maxlength', String(BRAND_NAME_MAX));
  });

  /*
   * 한 자짜리 주소는 `pattern` 과 `required` 를 통과해 서버까지 갔다가 거절당했다.
   * `minLength` 가 그것을 칸에서 막는다 — jsdom 은 tooShort 를 재지 않으므로 속성으로 본다.
   */
  it('두 자 미만을 막는 길이 칸에 있다', async () => {
    await openNew();

    expect(screen.getByLabelText(/^주소/)).toHaveAttribute('minlength', String(BRAND_SLUG_MIN));
    expect(BRAND_SLUG_MIN).toBeGreaterThan(1);
  });

  it('두 자짜리 주소는 모양에 맞는다', async () => {
    await openNew();

    const slug = screen.getByLabelText(/^주소/);
    await userEvent.type(slug, 'ab');

    expect(slug).toBeValid();
  });

  it.each(['MOOR', '무어', 'moor brand', '-moor', 'moor-'])('%s 는 주소로 받지 않는다', async (bad) => {
    await openNew();

    const slug = screen.getByLabelText(/^주소/);
    await userEvent.type(slug, bad);

    expect(slug).toBeInvalid();
  });

  it('수정 폼도 같은 규칙을 쓴다', () => {
    render(
      <BrandRowForm
        brandId="b-1" name="무어" slug="moor"
        merchantName={null} productCount={12} slugIsGenerated={false}
      />,
    );

    const slug = screen.getByLabelText('무어 주소');
    expect(slug).toHaveAttribute('pattern', BRAND_SLUG_PATTERN.source);
    expect(slug).toHaveAttribute('minlength', String(BRAND_SLUG_MIN));
  });
});

/**
 * **가맹점 브랜드는 여기서 만들지 않는다.** 그건 입점 승인이 만든다 — 여기서 만드는 것은
 * 가맹점 없는 자사 브랜드뿐이다.
 */
describe('자사 브랜드 등록', () => {
  const openNew = async () => {
    render(<NewBrandForm />);
    await userEvent.click(screen.getByRole('button', { name: '자사 브랜드 등록' }));
  };

  const fill = async () => {
    await userEvent.type(screen.getByLabelText('이름'), '무어');
    await userEvent.type(screen.getByLabelText(/^주소/), 'moor');
  };

  it('누르기 전에는 폼이 없다', () => {
    render(<NewBrandForm />);

    expect(screen.queryByLabelText('이름')).toBeNull();
  });

  it('이름과 주소를 보낸다', async () => {
    await openNew();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/brands');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: '무어', slug: 'moor' });
  });

  it('만들면 폼을 닫고 화면을 다시 받아 온다', async () => {
    await openNew();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(screen.queryByLabelText('이름')).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  /** 못 만들었으면 적은 것을 지우지 않는다 — 주소 하나 때문에 다시 치게 할 수 없다 */
  it('못 만들었으면 폼을 열어 둔 채 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 쓰고 있는 주소입니다' }, 409));
    await openNew();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 쓰고 있는 주소입니다');
    expect(screen.getByLabelText('이름')).toHaveValue('무어');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await openNew();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });

  it('취소하면 아무것도 보내지 않고 닫는다', async () => {
    await openNew();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByLabelText('이름')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

/**
 * **주소를 바꾸는 것이 이 화면의 요점이다.** 한글 이름으로 입점하면 주소가 `brand-a1b2c3d4`
 * 가 되는데, 사람이 읽을 수도 공유할 수도 없다. 바꿔도 옛 주소는 넘어간다 — **그걸 미리
 * 말해 준다.** 안 말하면 무서워서 못 바꾼다.
 */
describe('브랜드 수정', () => {
  const open = (over: Partial<Parameters<typeof BrandRowForm>[0]> = {}) =>
    render(
      <BrandRowForm
        {...{
          brandId: 'b-1', name: '무어', slug: 'moor',
          merchantName: null, productCount: 12, slugIsGenerated: false,
          ...over,
        }}
      />,
    );

  it('바꾼 것이 없으면 저장할 수 없다', () => {
    open();

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('바꾸면 그 브랜드로 보낸다', async () => {
    open();

    const name = screen.getByLabelText('무어 이름');
    await userEvent.clear(name);
    await userEvent.type(name, '무어 서울');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/brands/b-1');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ name: '무어 서울' });
  });

  /* 안 말하면 무서워서 못 바꾼다 */
  it('주소를 바꾸면 옛 주소가 어떻게 되는지 미리 말한다', async () => {
    open();

    const slug = screen.getByLabelText('무어 주소');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'moor-seoul');

    expect(screen.getByRole('status')).toHaveTextContent('/brand/moor');
    expect(screen.getByRole('status')).toHaveTextContent('새 주소로 넘어갑니다');
  });

  /** 그냥 두면 그 상태가 영영 간다는 것을 아무도 모른다 */
  it('자동으로 지어진 주소면 바꾸라고 말한다', () => {
    open({ slug: 'brand-a1b2c3d4', slugIsGenerated: true });

    expect(screen.getByText(/사람이 읽을 수 있는 주소로 바꿔 주세요/)).toBeDefined();
  });

  it('사람이 정한 주소에는 그 말을 하지 않는다', () => {
    open();

    expect(screen.queryByText(/사람이 읽을 수 있는 주소로 바꿔 주세요/)).toBeNull();
  });

  it('누구 브랜드이고 상품이 몇 개인지 적는다', () => {
    open({ merchantName: '스튜디오눈', productCount: 7 });

    expect(screen.getByText('스튜디오눈')).toBeDefined();
    expect(screen.getByText(/상품 7/)).toBeDefined();
  });

  it('가맹점이 없으면 자사 브랜드라고 적는다', () => {
    open({ merchantName: null });

    expect(screen.getByText('자사 브랜드')).toBeDefined();
  });

  it('못 고쳤으면 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 쓰고 있는 이름입니다' }, 409));
    open();

    const name = screen.getByLabelText('무어 이름');
    await userEvent.type(name, '2');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 쓰고 있는 이름입니다');
  });
});
