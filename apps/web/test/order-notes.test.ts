import { describe, it, expect, vi, beforeEach } from 'vitest';
import { orderNoteSchema } from '@shop/contract';
import type { Actor } from '@shop/core';

/**
 * 주문 내부 메모 — 보는 범위를 where 로, 남기는 가맹점은 세션이, 지우기는 쓴 사람만.
 */

const db = vi.hoisted(() => ({
  order: { findFirst: vi.fn<(...a: any[]) => any>() },
  orderNote: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    create: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { listOrderNotes, addOrderNote, deleteOrderNote } = await import('~/lib/orders/order-notes');
const { POST } = await import('~/app/api/admin/orders/[orderNo]/notes/route');
const { DELETE } = await import('~/app/api/admin/orders/[orderNo]/notes/[noteId]/route');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const ORDER_NO = '20260915-0000001';

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findFirst.mockResolvedValue({ id: 'o-1' });
  db.orderNote.create.mockImplementation(({ data }: any) => Promise.resolve({ id: 'n-new', body: data.body, merchantId: data.merchantId }));
  getActor.mockResolvedValue(admin);
  enforceRateLimit.mockResolvedValue(null);
});

describe('listOrderNotes', () => {
  const rows = [
    { id: 'n-1', body: '선물 포장 요청', createdAt: new Date('2026-09-15T01:00:00Z'), authorId: 'u-admin', merchantId: null, author: { name: '운영자' }, merchant: null },
    { id: 'n-2', body: '출고 지연', createdAt: new Date('2026-09-15T02:00:00Z'), authorId: 'u-m', merchantId: 'm-a', author: null, merchant: { name: '스튜디오눈' } },
  ];

  it('운영진은 조건 없이, 가맹점은 자기 가맹점 메모만 where 로 읽는다', async () => {
    db.orderNote.findMany.mockResolvedValue(rows);
    await listOrderNotes(admin, ORDER_NO);
    expect(db.orderNote.findMany.mock.calls[0]?.[0].where).toEqual({ order: { orderNo: ORDER_NO } });
    await listOrderNotes(merchant, ORDER_NO);
    expect(db.orderNote.findMany.mock.calls[1]?.[0].where).toEqual({ order: { orderNo: ORDER_NO }, merchantId: 'm-a' });
  });

  it('손님은 읽지도 않는다', async () => {
    expect(await listOrderNotes(customer, ORDER_NO)).toEqual([]);
    expect(db.orderNote.findMany).not.toHaveBeenCalled();
  });

  it('쓴 사람·가맹점 이름과 지울 수 있는지를 붙인다 — 지워진 계정은 그렇게 적는다', async () => {
    db.orderNote.findMany.mockResolvedValue(rows);
    const notes = await listOrderNotes(admin, ORDER_NO);
    expect(notes.map((n) => [n.authorName, n.merchantName, n.deletable])).toEqual([
      ['운영자', null, true],
      ['지워진 계정', '스튜디오눈', false],
    ]);
  });
});

describe('addOrderNote', () => {
  it('운영진 메모는 가맹점을 비우고, 가맹점 메모는 자기 가맹점을 적는다 — 몸체가 아니라 세션이 정한다', async () => {
    await addOrderNote(admin, ORDER_NO, '고객 요청: 부재 시 경비실');
    expect(db.orderNote.create.mock.calls[0]?.[0].data).toEqual({ orderId: 'o-1', authorId: 'u-admin', merchantId: null, body: '고객 요청: 부재 시 경비실' });
    await addOrderNote(merchant, ORDER_NO, '출고 하루 지연');
    expect(db.orderNote.create.mock.calls[1]?.[0].data).toMatchObject({ authorId: 'u-m', merchantId: 'm-a' });
  });

  it('가맹점은 자기 상품이 든 주문에만 — 아니면 없는 주문이다', async () => {
    db.order.findFirst.mockResolvedValue(null);
    await expect(addOrderNote(merchant, ORDER_NO, 'x')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', status: 404 });
    expect(db.order.findFirst.mock.calls[0]?.[0].where).toEqual({ orderNo: ORDER_NO, items: { some: { merchantId: 'm-a' } } });
    expect(db.orderNote.create).not.toHaveBeenCalled();
  });

  it('손님은 권한이 없다', async () => {
    await expect(addOrderNote(customer, ORDER_NO, 'x')).rejects.toThrow(/admin:access/);
  });
});

describe('deleteOrderNote', () => {
  it('쓴 사람이면 지우고 지운 내용을 돌려준다', async () => {
    db.orderNote.findFirst.mockResolvedValue({ id: 'n-1', body: '잘못 남김', authorId: 'u-admin', merchantId: null });
    expect(await deleteOrderNote(admin, ORDER_NO, 'n-1')).toEqual({ id: 'n-1', body: '잘못 남김', merchantId: null });
    expect(db.orderNote.delete).toHaveBeenCalledWith({ where: { id: 'n-1' } });
  });

  it('남의 메모는 못 지운다', async () => {
    db.orderNote.findFirst.mockResolvedValue({ id: 'n-2', body: '출고 지연', authorId: 'u-m', merchantId: 'm-a' });
    await expect(deleteOrderNote(admin, ORDER_NO, 'n-2')).rejects.toMatchObject({ code: 'NOT_AUTHOR', status: 403 });
    expect(db.orderNote.delete).not.toHaveBeenCalled();
  });

  it('가맹점이 볼 수 없는 메모는 찾는 조건에서부터 빠진다 — 있다는 것도 모른다', async () => {
    db.orderNote.findFirst.mockResolvedValue(null);
    await expect(deleteOrderNote(merchant, ORDER_NO, 'n-1')).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND', status: 404 });
    expect(db.orderNote.findFirst.mock.calls[0]?.[0].where).toEqual({ id: 'n-1', orderId: 'o-1', merchantId: 'm-a' });
  });
});

describe('orderNoteSchema', () => {
  it('비었거나 너무 길면 받지 않는다', () => {
    expect(orderNoteSchema.safeParse({ body: '   ' }).success).toBe(false);
    expect(orderNoteSchema.safeParse({ body: 'a'.repeat(1001) }).success).toBe(false);
    expect(orderNoteSchema.parse({ body: '  메모 ' })).toEqual({ body: '메모' });
  });
});

describe('주문 메모 창구', () => {
  const post = (body: unknown) =>
    POST(new Request(`http://localhost/api/admin/orders/${ORDER_NO}/notes`, { method: 'POST', body: JSON.stringify(body) }), {
      params: Promise.resolve({ orderNo: ORDER_NO }),
    });
  const del = () =>
    DELETE(new Request(`http://localhost/api/admin/orders/${ORDER_NO}/notes/n-1`, { method: 'DELETE' }), {
      params: Promise.resolve({ orderNo: ORDER_NO, noteId: 'n-1' }),
    });

  it('남기면 201 과 감사 로그', async () => {
    const res = await post({ body: '선물 포장' });
    expect(res.status).toBe(201);
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({ action: 'order.note.add', targetType: 'order', targetId: ORDER_NO });
  });

  it('비었으면 400, 로그인 안 했으면 401, 손님이면 403', async () => {
    expect((await post({ body: '' })).status).toBe(400);
    getActor.mockResolvedValueOnce(null);
    expect((await post({ body: 'x' })).status).toBe(401);
    getActor.mockResolvedValueOnce(customer);
    expect((await post({ body: 'x' })).status).toBe(403);
  });

  it('지우면 지운 내용을 감사 로그에 남기고, 막히면 기록하지 않는다', async () => {
    db.orderNote.findFirst.mockResolvedValue({ id: 'n-1', body: '잘못 남김', authorId: 'u-admin', merchantId: null });
    expect((await del()).status).toBe(200);
    expect(recordAudit.mock.calls[0]?.[0]).toMatchObject({ action: 'order.note.delete', before: { body: '잘못 남김' } });

    recordAudit.mockClear();
    db.orderNote.findFirst.mockResolvedValue({ id: 'n-1', body: 'x', authorId: 'u-other', merchantId: null });
    expect((await del()).status).toBe(403);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
