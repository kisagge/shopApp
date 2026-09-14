import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseCsv, type Actor } from '@shop/core';

/**
 * 주문 내려받기.
 *
 * 한 파일에 수천 명의 이름·연락처·주소가 들어간다. 그래서 이 파일이 지키는 것은
 * 기능보다 **선**이다.
 *
 * - 가맹점에게는 자기 상품 줄만, 손님 계정의 값(주문자 이름·이메일·등급)은 누구에게도
 * - 목록 화면과 같은 조건 — 같은 함수(adminOrderWhere)로 만든다
 * - 누가 몇 줄을 가져갔는지 감사 로그에
 * - 엑셀이 칸을 수식으로 실행하지 않게
 */

const db = vi.hoisted(() => ({
  order: { findMany: vi.fn<(...a: any[]) => any>() },
  orderItem: { count: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));

const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { exportAdminOrders, EXPORT_MAX_ROWS } = await import('~/lib/queries/admin/orders');
const { POST } = await import('~/app/api/admin/orders/export/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const ORDER = {
  orderNo: '20260901-0000001',
  placedAt: new Date('2026-09-01T00:30:00Z'), // 한국 시각 09:30
  status: 'PREPARING',
  recipient: '김받는',
  recipientPhone: '010-1234-5678',
  postalCode: '04524',
  address1: '서울 중구 세종대로 110',
  address2: '3층',
  deliveryMemo: '=HYPERLINK("http://evil")',
  shipment: null,
  items: [
    { productName: '울 코트', optionLabel: '오트 / M', quantity: 1, subtotal: 289000 },
    { productName: '니트, "라운드"', optionLabel: '블랙 / L', quantity: 2, subtotal: 118000 },
  ],
};

const call = (query = '') =>
  POST(new Request(`http://localhost/api/admin/orders/export${query}`, { method: 'POST' }));

beforeEach(() => {
  vi.clearAllMocks();
  db.orderItem.count.mockResolvedValue(2);
  db.order.findMany.mockResolvedValue([ORDER]);
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
  recordAudit.mockResolvedValue(undefined);
});

describe('무엇을 내려주나', () => {
  it('상품 한 줄씩 펼친다', async () => {
    const rows = await exportAdminOrders(admin, {});
    expect(rows.map((r) => r.productName)).toEqual(['울 코트', '니트, "라운드"']);
    expect(rows[0]!.address).toBe('서울 중구 세종대로 110 3층');
  });

  it('손님 계정의 값은 고르지도 않는다', async () => {
    await exportAdminOrders(admin, {});
    const select = db.order.findMany.mock.calls[0]![0].select as Record<string, unknown>;
    // 받아서 버리는 것으로는 부족하다 — 고르지 않으면 실수로 흘릴 길도 없다
    expect(select).not.toHaveProperty('user');
    expect(select).not.toHaveProperty('buyerEmail');
    expect(select).toHaveProperty('recipient');
  });

  it('가맹점에게는 자기 가맹점 주문의, 자기 상품 줄만 준다', async () => {
    await exportAdminOrders(merchant, {});
    const args = db.order.findMany.mock.calls[0]![0];
    expect(args.where.items).toEqual({ some: { merchantId: 'm-a' } });
    expect(args.select.items.where).toEqual({ merchantId: 'm-a' });
    expect(db.orderItem.count.mock.calls[0]![0].where.merchantId).toBe('m-a');
  });

  it('목록과 같은 조건을 건다', async () => {
    await exportAdminOrders(admin, { status: 'PREPARING', q: '20260901-0000001' });
    const where = db.order.findMany.mock.calls[0]![0].where;
    expect(where.status).toBe('PREPARING');
    expect(where.orderNo).toBe('20260901-0000001');
  });

  it('한도를 넘으면 읽기 전에 멈춘다', async () => {
    db.orderItem.count.mockResolvedValue(EXPORT_MAX_ROWS + 1);
    await expect(exportAdminOrders(admin, {})).rejects.toThrow(/한도/);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});

describe('창구', () => {
  it('엑셀에서 열리는 CSV 를 준다', async () => {
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);

    // BOM 이 없으면 한국어 엑셀이 한글을 깨뜨린다. text() 는 BOM 을 벗기므로 바이트로 본다
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = new TextDecoder().decode(bytes);

    const [header, first, second] = parseCsv(text);
    expect(header).toContain('송장번호');
    expect(first).toContain('2026-09-01 09:30');
    expect(first).toContain('배송준비');
    expect(second).toContain('니트, "라운드"');
  });

  it('수식으로 읽힐 칸은 글자로 묶는다', async () => {
    const text = await (await call()).text();
    const [, first] = parseCsv(text);
    expect(first).toContain(`'=HYPERLINK("http://evil")`);
    expect(first).not.toContain('=HYPERLINK("http://evil")');
  });

  it('누가 어떤 조건으로 몇 줄을 가져갔는지 남긴다', async () => {
    await call('?status=PREPARING&from=2026-09-01');
    expect(recordAudit).toHaveBeenCalledTimes(1);
    const entry = recordAudit.mock.calls[0]![0];
    expect(entry.action).toBe('order.export');
    expect(entry.actor).toBe(admin);
    expect(entry.after).toMatchObject({ rows: 2, status: 'PREPARING', from: '2026-09-01' });
  });

  it('모르는 상태 값은 조건에서 뺀다', async () => {
    await call('?status=HACKED');
    expect(db.order.findMany.mock.calls[0]![0].where.status).toBeUndefined();
  });

  it('로그인하지 않으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await call()).status).toBe(401);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });

  it('손님은 403 이고 기록도 파일도 없다', async () => {
    getActor.mockResolvedValue(customer);
    expect((await call()).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('소속 없는 가맹점 계정은 403', async () => {
    getActor.mockResolvedValue({ id: 'u-x', role: 'MERCHANT', merchantId: null });
    expect((await call()).status).toBe(403);
  });

  it('한도를 넘으면 413 으로 좁히라고 말한다', async () => {
    db.orderItem.count.mockResolvedValue(EXPORT_MAX_ROWS + 1);
    const response = await call();
    expect(response.status).toBe(413);
    expect(((await response.json()) as { message: string }).message).toMatch(/좁혀/);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('요청 한도에 걸리면 읽지 않는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call()).status).toBe(429);
    expect(db.order.findMany).not.toHaveBeenCalled();
  });
});
