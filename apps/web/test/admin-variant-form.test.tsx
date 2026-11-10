// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { VariantForm } = await import('~/app/admin/products/variant-form');

/**
 * 옵션 추가. **등록 직후 상품은 옵션이 없어 팔 수 없다** — 이 폼이 첫 관문이다.
 *
 * 단위 검사가 한 줄도 없었다. 폼이 `noValidate` 라서 빈 칸도 창구까지 가는데,
 * 그 선택이 뜻한 것인지(창구의 우리 말을 쓰려고) 실수인지 적힌 데가 없었다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const sent = () => JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(201, { id: 'v-1' }));
});

const fields = () => ({
  option: screen.getByLabelText(/옵션명/),
  sku: screen.getByLabelText(/SKU/),
  stock: screen.getByLabelText(/초기 재고/),
  submit: screen.getByRole('button', { name: '옵션 추가' }),
});

const fill = async () => {
  render(<VariantForm productId="p-1" />);
  const f = fields();
  await userEvent.type(f.option, '오트밀 / M');
  await userEvent.type(f.sku, 'moor-ct-oat-m');
  await userEvent.clear(f.stock);
  await userEvent.type(f.stock, '12');
  return f;
};

describe('칸', () => {
  it('옵션명과 SKU 는 필수고 재고는 0으로 시작한다', () => {
    render(<VariantForm productId="p-1" />);
    const f = fields();

    expect(f.option).toBeRequired();
    expect(f.sku).toBeRequired();
    expect(f.stock).toHaveValue(0);
  });

  it('SKU 는 적는 대로 대문자가 된다 — 같은 물건에 두 표기가 생기지 않게', async () => {
    render(<VariantForm productId="p-1" />);
    await userEvent.type(fields().sku, 'moor-ct-oat-m');

    expect(fields().sku).toHaveValue('MOOR-CT-OAT-M');
  });
});

describe('보내는 것', () => {
  it('적은 그대로 — 재고는 수로 바꿔 보낸다', async () => {
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/products/p-1/variants');
    expect(sent()).toEqual({ sku: 'MOOR-CT-OAT-M', optionLabel: '오트밀 / M', stock: 12 });
  });

  it('재고를 비우면 0 으로 간다 — NaN 이 창구까지 가면 안 된다', async () => {
    render(<VariantForm productId="p-1" />);
    const f = fields();
    await userEvent.type(f.option, '오트밀 / M');
    await userEvent.type(f.sku, 'SKU-1');
    await userEvent.clear(f.stock);
    await userEvent.click(f.submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sent().stock).toBe(0);
  });

  it('빈 칸으로 눌러도 창구까지 간다 — 브라우저 말풍선 대신 우리 말을 쓴다', async () => {
    /*
     * 폼에 `noValidate` 가 붙어 있다. 필수 칸이 비어도 브라우저가 막지 않고
     * 창구가 거절하며, 그 말이 아래에 뜬다 — 브라우저 말풍선은 우리 글이 아니고
     * 생김새도 다르다. 실수로 꺼 둔 것이 아니라는 뜻을 여기 적어 둔다.
     */
    fetchMock.mockResolvedValue(json(400, { message: 'SKU를 적어 주세요.' }));
    render(<VariantForm productId="p-1" />);
    await userEvent.click(fields().submit);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('SKU를 적어 주세요.'));
    expect(sent()).toEqual({ sku: '', optionLabel: '', stock: 0 });
  });
});

describe('끝난 뒤', () => {
  it('성공하면 세 칸이 비워진다 — 옵션을 연달아 더하는 자리다', async () => {
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(fields().option).toHaveValue('');
    expect(fields().sku).toHaveValue('');
    expect(fields().stock).toHaveValue(0);
  });

  it('실패하면 적은 값이 그대로 남는다 — 세 칸을 다시 적게 하지 않는다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '이미 있는 SKU 입니다.' }));
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('이미 있는 SKU 입니다.'));
    expect(fields().sku).toHaveValue('MOOR-CT-OAT-M');
    expect(fields().stock).toHaveValue(12);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('창구가 까닭을 안 적어 보내면 우리 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('옵션을 추가하지 못했습니다.'),
    );
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('네트워크 오류로 추가하지 못했습니다.'),
    );
  });

  it('보내는 중에는 단추가 잠긴다', async () => {
    let give!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { give = resolve; }));
    const f = await fill();
    await userEvent.click(f.submit);

    await waitFor(() => expect(screen.getByRole('button', { name: '추가 중…' })).toBeDisabled());
    await act(async () => {
      give(json(201, {}));
    });
  });
});
