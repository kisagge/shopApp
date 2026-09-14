import { describe, it, expect, vi, beforeEach } from 'vitest';
import { csvDocument, type Actor } from '@shop/core';

/**
 * 송장 일괄 올리기.
 *
 * **한 건 등록과 같은 함수를 줄마다 부른다** — 가맹점 범위·상태 검사·감사 로그를
 * 일괄 창구가 따로 들고 있으면 반드시 갈린다. 그리고 한 줄이 틀려도 나머지는 들어간다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));

const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const registerShipmentAudited = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const findUnchangedShipments = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/manage-shipment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/admin/manage-shipment')>();
  return { ...actual, registerShipmentAudited, findUnchangedShipments };
});

const { ShipmentError } = await import('~/lib/admin/manage-shipment');
const { POST } = await import('~/app/api/admin/orders/shipments/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const HEADER = ['주문번호', '상품', '택배사', '송장번호'];

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/orders/shipments', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

const upload = (rows: string[][], header = HEADER) => post({ csv: csvDocument(header, rows) });

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
  registerShipmentAudited.mockResolvedValue({});
  findUnchangedShipments.mockResolvedValue(new Set());
});

describe('등록', () => {
  it('줄마다 한 건 등록과 같은 함수를 부른다', async () => {
    const response = await upload([
      ['20260901-0000001', '코트', 'CJ대한통운', '123456789012'],
      ['20260901-0000002', '니트', 'cj', '223456789012'],
    ]);
    expect(response.status).toBe(200);
    expect(registerShipmentAudited).toHaveBeenCalledTimes(2);

    const [orderNo, input, actor] = registerShipmentAudited.mock.calls[0]!;
    expect(orderNo).toBe('20260901-0000001');
    expect(input).toEqual({ carrier: 'CJ', trackingNumber: '123456789012' });
    expect(actor).toBe(admin);

    expect(await response.json()).toEqual({ registered: 2, skipped: 0, unchanged: 0, failures: [] });
  });

  it('이미 같은 송장이 붙은 주문은 다시 등록하지 않고 따로 센다', async () => {
    // 내려받은 파일을 통째로 다시 올리면 지난번 주문이 섞인다. "N건 등록" 이 거짓말이 되면 안 된다
    findUnchangedShipments.mockResolvedValue(new Set(['20260901-0000001']));
    const response = await upload([
      ['20260901-0000001', '코트', 'CJ대한통운', '123456789012'],
      ['20260901-0000002', '니트', 'CJ대한통운', '223456789012'],
    ]);

    expect(registerShipmentAudited).toHaveBeenCalledTimes(1);
    expect(registerShipmentAudited.mock.calls[0]![0]).toBe('20260901-0000002');
    expect(await response.json()).toMatchObject({ registered: 1, unchanged: 1 });
    // 같은지 보는 것도 누가 올렸는지(가맹점 범위)를 알아야 한다
    expect(findUnchangedShipments.mock.calls[0]![1]).toBe(admin);
  });

  it('한 주문의 여러 상품 줄은 한 번만 등록한다', async () => {
    await upload([
      ['20260901-0000001', '코트', 'CJ대한통운', '123456789012'],
      ['20260901-0000001', '니트', '', ''],
    ]);
    expect(registerShipmentAudited).toHaveBeenCalledTimes(1);
  });

  it('한 줄이 막혀도 나머지는 들어가고, 막힌 줄은 사유와 함께 돌아온다', async () => {
    registerShipmentAudited
      .mockRejectedValueOnce(new ShipmentError('NOT_SHIPPABLE', '취소 주문에는 송장을 등록할 수 없습니다.'))
      .mockResolvedValueOnce({});

    const response = await upload([
      ['20260901-0000001', '코트', 'CJ대한통운', '123456789012'],
      ['20260901-0000002', '니트', 'CJ대한통운', '223456789012'],
    ]);
    const body = (await response.json()) as { registered: number; failures: { orderNo: string; lines: number[]; code: string }[] };

    expect(body.registered).toBe(1);
    expect(body.failures).toEqual([
      expect.objectContaining({ orderNo: '20260901-0000001', code: 'NOT_SHIPPABLE', lines: [2] }),
    ]);
  });

  it('파일에서 이미 틀린 줄은 등록을 부르지 않고 실패로 돌려준다', async () => {
    const response = await upload([
      ['20260901-0000001', '코트', '비둘기택배', '123456789012'],
      ['20260901-0000002', '니트', 'CJ대한통운', '223456789012'],
    ]);
    const body = (await response.json()) as { registered: number; failures: { code: string; message: string }[] };

    expect(registerShipmentAudited).toHaveBeenCalledTimes(1);
    expect(body.failures).toEqual([expect.objectContaining({ code: 'UNKNOWN_CARRIER' })]);
    expect(body.failures[0]!.message).toContain('비둘기택배');
  });

  it('모르는 오류는 삼키지 않는다', async () => {
    // 삼키면 DB 가 끊겨도 "실패 N건" 으로 보여 운영자가 파일을 고치러 간다
    registerShipmentAudited.mockRejectedValue(new Error('connection lost'));
    await expect(upload([['20260901-0000001', '코트', 'CJ대한통운', '123456789012']])).rejects.toThrow('connection lost');
  });
});

describe('막는 것', () => {
  it('머리칸이 없으면 무엇이 없는지 말한다', async () => {
    const response = await upload([['20260901-0000001', '123456789012']], ['주문번호', '송장']);
    expect(response.status).toBe(400);
    expect(((await response.json()) as { message: string }).message).toContain('택배사');
    expect(registerShipmentAudited).not.toHaveBeenCalled();
  });

  it('송장 권한이 없으면 본문을 읽기 전에 403', async () => {
    getActor.mockResolvedValue(customer);
    const response = await post('이건 JSON 도 아니다');
    expect(response.status).toBe(403);
  });

  it('로그인하지 않으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await post({ csv: 'x' })).status).toBe(401);
  });

  it('요청 한도에 걸리면 등록하지 않는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    const response = await upload([['20260901-0000001', '코트', 'CJ대한통운', '123456789012']]);
    expect(response.status).toBe(429);
    expect(registerShipmentAudited).not.toHaveBeenCalled();
  });

  it('빈 파일은 검증에서 걸린다', async () => {
    expect((await post({ csv: '' })).status).toBe(400);
  });
});
