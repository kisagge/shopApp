import { describe, it, expect, vi, beforeEach } from 'vitest';
import { csvDocument, type Actor } from '@shop/core';

/**
 * 재고 일괄 수정·내려받기 창구.
 *
 * 파일에서 이미 틀린 줄과 적용하다 막힌 줄을 **한 표로** 돌려주는지, 권한을 본문보다 먼저 보는지,
 * 무언가 바뀌었을 때만 카탈로그 캐시를 터는지 본다.
 */

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));
const revalidateCatalog = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/cache', () => ({ revalidateCatalog }));

const lib = vi.hoisted(() => ({ bulkUpdateStock: vi.fn<(...a: any[]) => any>(), exportStock: vi.fn<(...a: any[]) => any>() }));
vi.mock('~/lib/admin/bulk-stock', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/bulk-stock')>()),
  ...lib,
}));

const { POST } = await import('~/app/api/admin/products/stock/bulk/route');
const { GET } = await import('~/app/api/admin/products/stock/export/route');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const HEADER = ['SKU', '브랜드', '상품', '옵션', '판매', '재고'];

const post = (body: unknown) =>
  POST(new Request('http://localhost/api/admin/products/stock/bulk', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
  lib.bulkUpdateStock.mockResolvedValue({ updated: 1, unchanged: 1, failures: [] });
});

describe('일괄 수정', () => {
  it('파일에서 틀린 줄은 적용하지 않고, 적용 결과와 한 표로 돌려준다', async () => {
    lib.bulkUpdateStock.mockResolvedValue({
      updated: 1, unchanged: 0,
      failures: [{ sku: 'NONE', lines: [4], code: 'SKU_NOT_FOUND', message: '없는 SKU 입니다.' }],
    });
    const csv = csvDocument(HEADER, [
      ['COAT-M', 'MOOR', '코트', 'M', '판매중', '10'],
      ['COAT-L', 'MOOR', '코트', 'L', '판매중', '1.5'],
      ['NONE', '', '', '', '', '3'],
      ['KNIT-M', '', '', '', '', ''],
    ]);
    const response = await post({ csv });
    const body = await response.json();

    expect(lib.bulkUpdateStock.mock.calls[0]![1].map((e: { sku: string }) => e.sku)).toEqual(['COAT-M', 'NONE']);
    expect(body).toMatchObject({ updated: 1, unchanged: 0, skipped: 1 });
    expect(body.failures.map((f: { sku: string; code: string }) => [f.sku, f.code])).toEqual([
      ['COAT-L', 'INVALID_STOCK'], ['NONE', 'SKU_NOT_FOUND'],
    ]);
    expect(revalidateCatalog).toHaveBeenCalled();
  });

  it('아무것도 안 바뀌면 캐시를 털지 않는다', async () => {
    lib.bulkUpdateStock.mockResolvedValue({ updated: 0, unchanged: 3, failures: [] });
    await post({ csv: csvDocument(HEADER, [['COAT-M', '', '', '', '', '10']]) });
    expect(revalidateCatalog).not.toHaveBeenCalled();
  });

  it('머리칸이 없으면 무엇이 없는지 말하고 적용하지 않는다', async () => {
    const response = await post({ csv: 'sku,수량\r\nA,1\r\n' });
    expect(response.status).toBe(400);
    expect((await response.json()).message).toContain('재고');
    expect(lib.bulkUpdateStock).not.toHaveBeenCalled();
  });

  it('상품을 고칠 권한이 없으면 본문을 읽기 전에 403', async () => {
    getActor.mockResolvedValue({ id: 'u-c', role: 'CUSTOMER', merchantId: null });
    expect((await post('JSON 아님')).status).toBe(403);
  });

  it('요청 한도에 걸리면 적용하지 않는다', async () => {
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await post({ csv: 'SKU,재고\r\nA,1\r\n' })).status).toBe(429);
    expect(lib.bulkUpdateStock).not.toHaveBeenCalled();
  });
});

describe('내려받기', () => {
  it('BOM 붙은 CSV 를 캐시 없이 준다 — 옛 재고 파일을 고쳐 올리면 팔린 만큼이 되살아난다', async () => {
    lib.exportStock.mockResolvedValue([['COAT-M', 'MOOR', '코트', 'M', '판매중', '3']]);
    const response = await GET(new Request('http://localhost/api/admin/products/stock/export'));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('SKU,브랜드,상품,옵션,판매,재고');
  });

  it('로그인하지 않으면 401', async () => {
    getActor.mockResolvedValue(null);
    expect((await GET(new Request('http://localhost/api/admin/products/stock/export'))).status).toBe(401);
  });
});
