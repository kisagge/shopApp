import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));
const exportSettlementLines = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/admin/settlement-export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/admin/settlement-export')>()),
  exportSettlementLines,
}));

const { GET } = await import('~/app/api/admin/settlements/export/route');
const { SettlementError } = await import('@shop/core');

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const call = (query: string) => GET(new Request(`http://localhost/api/admin/settlements/export${query}`));

/** 정산 내역 창구 — 기간·가맹점을 넘기고, 캐시 없이 CSV 를 준다 */
describe('정산 내역 창구', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActor.mockResolvedValue(admin);
    enforceRateLimit.mockResolvedValue(null);
    exportSettlementLines.mockResolvedValue([['합계 · 지급액', '무어', '', '', '', '', '', 93_334]]);
  });

  it('기간과 가맹점을 넘기고 BOM 붙은 CSV 를 캐시 없이 준다', async () => {
    const response = await call('?period=2026-08&merchant=m-b');
    expect(exportSettlementLines).toHaveBeenCalledWith(admin, '2026-08', 'm-b');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('구분,가맹점,주문번호,기준일시,상품,옵션,수량,금액');
  });

  it('틀린 기간은 400 으로 이유를 말한다', async () => {
    exportSettlementLines.mockRejectedValue(new SettlementError('기간 형식이 아닙니다: 2026-13'));
    const response = await call('?period=2026-13');
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_PERIOD');
  });

  it('로그인하지 않으면 401, 한도에 걸리면 읽지 않는다', async () => {
    getActor.mockResolvedValue(null);
    expect((await call('?period=2026-08')).status).toBe(401);

    getActor.mockResolvedValue(admin);
    enforceRateLimit.mockResolvedValue(new Response(null, { status: 429 }));
    expect((await call('?period=2026-08')).status).toBe(429);
    expect(exportSettlementLines).not.toHaveBeenCalled();
  });
});
