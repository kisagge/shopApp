// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { OrderBulkActions } = await import('~/app/admin/orders/order-bulk-actions');

const fetchMock = vi.fn<(...a: any[]) => any>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  // jsdom 에는 없다
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const csvFile = (text: string) => new File([text], 'orders.csv', { type: 'text/csv' });

describe('구조', () => {
  it('제목이 붙은 영역이고, 파일 입력에 라벨과 설명이 있다', () => {
    render(<OrderBulkActions filter={{}} canFulfill />);
    expect(screen.getByRole('region', { name: '내려받기 · 일괄 처리' })).toBeDefined();

    const input = screen.getByLabelText('CSV 파일');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('송장 권한이 없으면 올리기는 그리지 않는다', () => {
    // 눌러 보고 403 을 받느니 없는 편이 낫다
    render(<OrderBulkActions filter={{}} canFulfill={false} />);
    expect(screen.getByRole('button', { name: 'CSV 내려받기' })).toBeDefined();
    expect(screen.queryByLabelText('CSV 파일')).toBeNull();
  });
});

describe('내려받기', () => {
  it('화면의 조건을 그대로 넘기고 POST 로 부른다', async () => {
    fetchMock.mockResolvedValue(new Response('\uFEFF주문번호\r\n', {
      status: 200,
      headers: { 'content-disposition': 'attachment; filename="orders-202609011230.csv"' },
    }));
    render(<OrderBulkActions filter={{ status: 'PREPARING', q: '김', from: undefined }} canFulfill />);

    await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }));

    await waitFor(() => expect(screen.getByText('주문 파일을 내려받았습니다.')).toBeDefined());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(init).toMatchObject({ method: 'POST' });
    const params = new URL(url as string, 'http://x').searchParams;
    expect(params.get('status')).toBe('PREPARING');
    expect(params.get('q')).toBe('김');
    // 빈 조건은 싣지 않는다 — from= 이 붙으면 서버가 빈 날짜를 형식 오류로 읽는다
    expect(params.has('from')).toBe(false);
  });

  it('한도를 넘으면 서버의 말을 그대로 보여 준다', async () => {
    fetchMock.mockResolvedValue(json(413, { message: '기간이나 상태로 좁혀 주세요.' }));
    render(<OrderBulkActions filter={{}} canFulfill />);

    await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }));
    expect((await screen.findByRole('alert')).textContent).toContain('좁혀');
  });
});

describe('송장 올리기', () => {
  it('결과를 소리로 알리고, 실패한 줄을 표로 보여 준다', async () => {
    fetchMock.mockResolvedValue(json(200, {
      registered: 3,
      skipped: 2,
      unchanged: 4,
      failures: [{ orderNo: '20260901-0000009', lines: [5], code: 'NOT_SHIPPABLE', message: '취소 주문에는 송장을 등록할 수 없습니다.' }],
    }));
    render(<OrderBulkActions filter={{}} canFulfill />);

    await userEvent.upload(screen.getByLabelText('CSV 파일'), csvFile('주문번호,택배사,송장번호\r\n'));
    await userEvent.click(screen.getByRole('button', { name: '송장 올리기' }));

    expect(await screen.findByText('3건 등록, 이미 같은 송장 4건, 송장이 빈 2줄 건너뜀, 1건 실패')).toBeDefined();
    const table = screen.getByRole('table', { name: /등록하지 못한 줄/ });
    expect(within(table).getByText('20260901-0000009')).toBeDefined();
    expect(within(table).getByText(/취소 주문/)).toBeDefined();

    // 등록된 것이 있으면 목록의 상태가 바뀌었다
    expect(refresh).toHaveBeenCalled();

    const body = JSON.parse(fetchMock.mock.calls[0]![1].body as string) as { csv: string };
    expect(body.csv).toContain('주문번호');
  });

  it('파일을 고르지 않으면 부르지 않는다', async () => {
    render(<OrderBulkActions filter={{}} canFulfill />);
    await userEvent.click(screen.getByRole('button', { name: '송장 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('파일을 골라');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('머리칸이 없다는 거절을 보여 주고 목록은 건드리지 않는다', async () => {
    fetchMock.mockResolvedValue(json(400, { message: '필요한 머리칸이 없습니다: 택배사' }));
    render(<OrderBulkActions filter={{}} canFulfill />);

    await userEvent.upload(screen.getByLabelText('CSV 파일'), csvFile('a,b\r\n'));
    await userEvent.click(screen.getByRole('button', { name: '송장 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('택배사');
    expect(refresh).not.toHaveBeenCalled();
  });
});
