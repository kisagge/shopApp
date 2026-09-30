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
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);
    expect(screen.getByRole('group', { name: '내려받기 · 일괄 처리' })).toBeDefined();

    const input = screen.getByLabelText('송장 CSV 파일');
    expect(input.getAttribute('type')).toBe('file');
    expect(input.getAttribute('aria-describedby')).toBeTruthy();
  });

  it('송장 권한이 없으면 올리기는 그리지 않는다', () => {
    // 눌러 보고 403 을 받느니 없는 편이 낫다
    render(<OrderBulkActions filter={{}} canFulfill={false} addressChanged={0} />);
    expect(screen.getByRole('button', { name: 'CSV 내려받기' })).toBeDefined();
    expect(screen.queryByLabelText('송장 CSV 파일')).toBeNull();
    expect(screen.queryByLabelText('배송완료 CSV 파일')).toBeNull();
  });

  /**
   * **파일 칸이 둘인데 이름이 같으면 안 된다.** 낭독기로 훑는 사람은 어느 것이 송장이고 어느 것이
   * 배송완료인지 알 수 없고, 잘못 올리면 되돌리기 어려운 일이 일어난다.
   */
  it('파일 칸 둘이 서로 다른 이름을 갖는다', () => {
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    expect(screen.getByLabelText('송장 CSV 파일')).toBeDefined();
    expect(screen.getByLabelText('배송완료 CSV 파일')).toBeDefined();
  });
});

describe('내려받기', () => {
  it('화면의 조건을 그대로 넘기고 POST 로 부른다', async () => {
    fetchMock.mockResolvedValue(new Response('\uFEFF주문번호\r\n', {
      status: 200,
      headers: { 'content-disposition': 'attachment; filename="orders-202609011230.csv"' },
    }));
    render(<OrderBulkActions filter={{ status: 'PREPARING', q: '김', from: undefined }} canFulfill addressChanged={0} />);

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
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.click(screen.getByRole('button', { name: 'CSV 내려받기' }));
    expect((await screen.findByRole('alert')).textContent).toContain('좁혀');
  });
});

/**
 * 올리기 전의 경고.
 *
 * **올려 보고 나서야 알면 늦다.** 배송지가 바뀐 주문은 일괄로 등록되지 않는데(창구가 그 줄을 거절한다),
 * 그때는 이미 라벨을 다 찍어 놓았다 — 한 건씩 붙일 때는 화면이 주소를 보여 주고 한 번 더 묻지만
 * 일괄에는 그 자리가 없다.
 */
describe('배송지가 바뀐 주문이 섞여 있으면', () => {
  it('몇 건인지와 무엇을 해야 하는지 올리기 전에 말한다', () => {
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={3} />);

    const panel = screen.getByRole('group', { name: '내려받기 · 일괄 처리' });
    expect(panel).toHaveTextContent('배송지가 바뀐 주문 3건');
    expect(panel, '일괄로는 안 된다는 것과 어디로 가야 하는지').toHaveTextContent('일괄로는 등록되지 않습니다');
    expect(panel).toHaveTextContent('배송지 변경');
  });

  /** 늘 붙어 있으면 아무도 읽지 않는다 */
  it('없으면 아무 말도 하지 않는다', () => {
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    expect(screen.queryByText(/일괄로는 등록되지 않습니다/)).toBeNull();
  });

  /** 송장을 올릴 수 없는 사람에게는 그 경고도 할 말이 없다 */
  it('송장 권한이 없으면 그 자리가 아예 없다', () => {
    render(<OrderBulkActions filter={{}} canFulfill={false} addressChanged={3} />);

    expect(screen.queryByText(/일괄로는 등록되지 않습니다/)).toBeNull();
  });

  it('배송완료 일괄 처리에는 붙지 않는다 — 그쪽은 주소를 쓰지 않는다', () => {
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={3} />);

    expect(screen.getAllByText(/일괄로는 등록되지 않습니다/)).toHaveLength(1);
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
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.upload(screen.getByLabelText('송장 CSV 파일'), csvFile('주문번호,택배사,송장번호\r\n'));
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
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);
    await userEvent.click(screen.getByRole('button', { name: '송장 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('파일을 골라');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('머리칸이 없다는 거절을 보여 주고 목록은 건드리지 않는다', async () => {
    fetchMock.mockResolvedValue(json(400, { message: '필요한 머리칸이 없습니다: 택배사' }));
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.upload(screen.getByLabelText('송장 CSV 파일'), csvFile('a,b\r\n'));
    await userEvent.click(screen.getByRole('button', { name: '송장 올리기' }));

    expect((await screen.findByRole('alert')).textContent).toContain('택배사');
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * 배송완료 일괄 처리.
 *
 * **송장은 한 번에 올리는데 도착 처리는 주문마다 눌러야 했다.** 배송완료일부터 반품 기한과 자동
 * 구매확정 시계가 도는데, 안 눌리면 손님은 반품 신청조차 못 한다.
 */
describe('배송완료 일괄 처리', () => {
  it('고른 파일을 글자로 보내고, 결과를 소리로 알린다', async () => {
    fetchMock.mockResolvedValue(json(200, { delivered: 2, merged: 1, failures: [] }));
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.upload(
      screen.getByLabelText('배송완료 CSV 파일'),
      csvFile('주문번호\r\n20260915-0000001\r\n20260915-0000001\r\n20260915-0000002\r\n'),
    );
    await userEvent.click(screen.getByRole('button', { name: '배송완료 처리' }));

    const [url, init] = fetchMock.mock.calls.at(-1)!;
    expect(url).toBe('/api/admin/orders/deliveries');
    const body = (init as RequestInit).body;
    expect(typeof body).toBe('string');
    expect(JSON.parse(body as string)).toMatchObject({
      csv: expect.stringContaining('20260915-0000001'),
    });

    const summary = await screen.findByText(/2건 배송완료/);
    expect(summary.getAttribute('aria-live')).toBe('polite');
    expect(summary.textContent, '묶인 줄도 말해 줘야 숫자가 안 맞아 보이지 않는다').toContain('1줄 묶음');
  });

  it('처리하지 못한 줄을 표로 보여 준다 — 고쳐서 그 줄만 다시 올린다', async () => {
    fetchMock.mockResolvedValue(json(200, {
      delivered: 1,
      merged: 0,
      failures: [{ orderNo: '20260915-0000002', lines: [3], code: 'INVALID_TRANSITION', message: '취소된 주문입니다.' }],
    }));
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.upload(screen.getByLabelText('배송완료 CSV 파일'), csvFile('주문번호\r\n20260915-0000001\r\n'));
    await userEvent.click(screen.getByRole('button', { name: '배송완료 처리' }));

    const table = await screen.findByRole('region', { name: '처리하지 못한 줄' });
    expect(table.textContent).toContain('취소된 주문입니다.');
    expect(table.textContent).toContain('20260915-0000002');
  });

  it('파일을 고르지 않고 누르면 그 자리에서 말한다', async () => {
    render(<OrderBulkActions filter={{}} canFulfill addressChanged={0} />);

    await userEvent.click(screen.getByRole('button', { name: '배송완료 처리' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
