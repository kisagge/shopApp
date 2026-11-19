// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { StockBulkActions } = await import('~/app/admin/products/stock-bulk-actions');

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

describe('재고 내려받기 · 일괄 수정', () => {
  it('제목 붙은 영역이고, 파일 입력에 라벨과 설명이 있다', () => {
    render(<StockBulkActions canWrite />);
    expect(screen.getByRole('region', { name: '재고 내려받기 · 일괄 수정' })).toBeInTheDocument();
    expect(screen.getByLabelText('재고 CSV 파일')).toHaveAccessibleDescription(/재고\(와 판매\) 칸을 고쳐 올리세요/);
  });

  it('상품을 고칠 권한이 없으면 내려받기만 있다', () => {
    render(<StockBulkActions canWrite={false} />);
    expect(screen.getByRole('button', { name: '재고 CSV 내려받기' })).toBeInTheDocument();
    expect(screen.queryByLabelText('재고 CSV 파일')).toBeNull();
  });

  it('올리면 결과를 소리로 알리고, 고치지 못한 줄을 표로 보여 준다', async () => {
    fetchMock.mockResolvedValue(json(200, {
      updated: 2, unchanged: 30, skipped: 1,
      failures: [{ sku: 'COAT-L', lines: [5], code: 'INVALID_STOCK', message: '재고는 0 이상의 정수여야 합니다. (1.5)' }],
    }));
    render(<StockBulkActions canWrite />);

    await userEvent.upload(screen.getByLabelText('재고 CSV 파일'), new File(['SKU,재고\r\n'], 'stock.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: '재고 올리기' }));

    expect(await screen.findByText('2개 수정, 값이 같은 30개, 재고 칸이 빈 1줄 건너뜀, 1건 실패')).toBeInTheDocument();
    const table = screen.getByRole('table', { name: /고치지 못한 줄/ });
    expect(within(table).getByText('COAT-L')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('바뀐 게 없으면 목록을 새로 그리지 않는다', async () => {
    fetchMock.mockResolvedValue(json(200, { updated: 0, unchanged: 3, skipped: 0, failures: [] }));
    render(<StockBulkActions canWrite />);
    await userEvent.upload(screen.getByLabelText('재고 CSV 파일'), new File(['SKU,재고\r\n'], 'stock.csv', { type: 'text/csv' }));
    await userEvent.click(screen.getByRole('button', { name: '재고 올리기' }));
    await screen.findByText(/0개 수정/);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('파일을 고르지 않으면 부르지 않는다', async () => {
    render(<StockBulkActions canWrite />);
    await userEvent.click(screen.getByRole('button', { name: '재고 올리기' }));
    expect((await screen.findByRole('alert')).textContent).toContain('파일을 골라');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('내려받기는 GET 으로 부르고 받은 것을 알린다', async () => {
    fetchMock.mockResolvedValue(new Response('\uFEFFSKU,재고\r\n', {
      status: 200, headers: { 'content-disposition': 'attachment; filename="stock-202609151200.csv"' },
    }));
    render(<StockBulkActions canWrite />);
    await userEvent.click(screen.getByRole('button', { name: '재고 CSV 내려받기' }));
    await waitFor(() => expect(screen.getByText('재고 파일을 내려받았습니다.')).toBeInTheDocument());
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/products/stock/export');
  });
});

/**
 * **실패가 조용하면 운영자는 올린 줄 안다.**
 *
 * 이 자리는 재고를 한 번에 수백 줄 고치는 곳이다. 거절이든 끊김이든 말이
 * 없으면 운영자는 창을 닫고 가 버리고, 그날의 재고는 CSV 와 다른 값으로 남는다
 * — 품절 아닌 것이 품절로 보이거나, 없는 물건이 팔린다.
 */
describe('올리기가 실패하면', () => {
  const upload = async () => {
    await userEvent.upload(
      screen.getByLabelText('재고 CSV 파일'),
      new File(['SKU,재고\r\n'], 'stock.csv', { type: 'text/csv' }),
    );
    await userEvent.click(screen.getByRole('button', { name: '재고 올리기' }));
  };

  it('창구가 거절하면 그 까닭을 그대로 옮긴다', async () => {
    fetchMock.mockResolvedValue(json(400, { message: '첫 줄의 머리글이 다릅니다.' }));
    render(<StockBulkActions canWrite />);

    await upload();

    expect((await screen.findByRole('alert')).textContent).toContain('첫 줄의 머리글이 다릅니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('까닭을 안 주면 우리 문장으로 말한다 — 빈 경고를 띄우지 않는다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<StockBulkActions canWrite />);

    await upload();

    expect((await screen.findByRole('alert')).textContent).toContain('재고를 올리지 못했습니다');
  });

  it('응답이 JSON 이 아니어도 말한다 — 502 가 HTML 을 주는 날이다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    render(<StockBulkActions canWrite />);

    await upload();

    expect((await screen.findByRole('alert')).textContent).toContain('재고를 올리지 못했습니다');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<StockBulkActions canWrite />);

    await upload();

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류');
  });

  it('실패한 뒤에도 단추가 다시 눌린다 — 고쳐서 바로 올릴 수 있어야 한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<StockBulkActions canWrite />);

    await upload();

    await waitFor(() => expect(screen.getByRole('button', { name: '재고 올리기' })).toBeEnabled());
  });

  it('실패하면 앞선 결과를 치운다 — 지난 성공이 남아 "됐다" 로 읽힌다', async () => {
    fetchMock.mockResolvedValueOnce(json(200, { updated: 2, unchanged: 0, skipped: 0, failures: [] }));
    render(<StockBulkActions canWrite />);
    await upload();
    expect(await screen.findByText(/2개 수정/)).toBeInTheDocument();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await upload();

    await waitFor(() => expect(screen.queryByText(/2개 수정/)).toBeNull());
  });
});

describe('내려받기가 실패하면', () => {
  const download = () => userEvent.click(screen.getByRole('button', { name: '재고 CSV 내려받기' }));

  it('창구가 거절하면 그 까닭을 옮긴다', async () => {
    fetchMock.mockResolvedValue(json(403, { message: '권한이 없습니다.' }));
    render(<StockBulkActions canWrite />);

    await download();

    expect((await screen.findByRole('alert')).textContent).toContain('권한이 없습니다.');
  });

  it('빈 파일을 내려주지 않는다 — 거절을 파일로 저장하면 운영자는 그것이 재고라고 믿는다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    render(<StockBulkActions canWrite />);

    await download();

    await screen.findByRole('alert');
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<StockBulkActions canWrite />);

    await download();

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류');
  });
});
