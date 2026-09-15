import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 1:1 문의 사진 — 쓴 사람 아래 추측할 수 없는 키로, 3장까지, 상품 문의에는 받지 않고, 문의를 못 만들면 되돌린다.
 */

const storage = vi.hoisted(() => ({ put: vi.fn<(...a: any[]) => any>(), remove: vi.fn<(...a: any[]) => any>(), name: 'test' }));
vi.mock('~/lib/storage', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/lib/storage')>()),
  getStorage: () => storage,
}));
const db = vi.hoisted(() => ({
  inquiry: { create: vi.fn<(...a: any[]) => any>() },
  product: { findFirst: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));
const getSessionUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getSessionUser }));
const enforceRateLimit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit }));

const { uploadInquiryImages } = await import('~/lib/inquiry/images');
const { POST } = await import('~/app/api/inquiries/route');
const { StorageError } = await import('~/lib/storage');

const PNG = () => {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return bytes;
};

const multipart = (fields: unknown, count: number) => {
  const form = new FormData();
  form.append('data', JSON.stringify(fields));
  for (let i = 0; i < count; i += 1) form.append('images', new File([PNG()], `p${i}.png`, { type: 'image/png' }));
  return new Request('http://localhost/api/inquiries', { method: 'POST', body: form });
};

const SUPPORT = { topic: 'DELIVERY', content: '받은 상품이 파손되어 왔습니다.', isPrivate: true };

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  storage.put.mockImplementation((input: { key: string }) => { n += 1; return Promise.resolve({ url: `https://cdn.test/${input.key}?n=${n}` }); });
  storage.remove.mockResolvedValue(undefined);
  db.inquiry.create.mockResolvedValue({ id: 'q-1', content: SUPPORT.content, isPrivate: true, createdAt: new Date() });
  db.product.findFirst.mockResolvedValue({ id: 'p-1' });
  getSessionUser.mockResolvedValue({ id: 'u-1' });
  enforceRateLimit.mockResolvedValue(null);
});

describe('uploadInquiryImages', () => {
  it('쓴 사람 아래, 파일 이름이 아닌 추측할 수 없는 키로 올린다', async () => {
    const out = await uploadInquiryImages('u-1', [{ bytes: PNG(), declaredType: 'image/png' }]);
    expect(out[0]!.key).toMatch(/^inquiries\/u-1\/[A-Za-z0-9_-]{16,}\.png$/);
  });

  it('3장을 넘으면 아무것도 올리지 않는다', async () => {
    const four = Array.from({ length: 4 }, () => ({ bytes: PNG(), declaredType: 'image/png' }));
    await expect(uploadInquiryImages('u-1', four)).rejects.toMatchObject({ code: 'TOO_MANY_INQUIRY_IMAGES' });
    expect(storage.put).not.toHaveBeenCalled();
  });
});

describe('POST /api/inquiries — 사진', () => {
  it('1:1 문의에 사진을 붙이면 올리고 문의에 순서대로 잇는다', async () => {
    const res = await POST(multipart(SUPPORT, 2));
    expect(res.status).toBe(201);
    expect(storage.put).toHaveBeenCalledTimes(2);
    const data = db.inquiry.create.mock.calls[0]?.[0].data;
    expect(data.images.createMany.data).toEqual([
      expect.objectContaining({ storageKey: expect.stringMatching(/^inquiries\/u-1\//), sortOrder: 0 }),
      expect.objectContaining({ sortOrder: 1 }),
    ]);
  });

  it('상품 문의에 사진을 붙이면 올리기 전에 거절한다 — 공개 Q&A 에 손님 사진이 걸리지 않게', async () => {
    const res = await POST(multipart({ productId: 'clh1abc2300000000000000000', content: '사이즈가 궁금합니다.', isPrivate: false }, 1));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'IMAGES_SUPPORT_ONLY' });
    expect(storage.put).not.toHaveBeenCalled();
    expect(db.inquiry.create).not.toHaveBeenCalled();
  });

  it('4장이면 파일을 다 읽기 전에 400', async () => {
    const res = await POST(multipart(SUPPORT, 4));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: 'TOO_MANY_INQUIRY_IMAGES' });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('문의를 못 만들면 올린 사진을 되돌린다', async () => {
    db.inquiry.create.mockRejectedValue(new Error('db down'));
    await expect(POST(multipart(SUPPORT, 1))).rejects.toThrow('db down');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });

  it('저장소가 없거나 실패하면 503 과 사진 없이 다시 보내라는 말', async () => {
    storage.put.mockRejectedValue(new StorageError('NOT_CONFIGURED', 'x'));
    const res = await POST(multipart(SUPPORT, 1));
    expect(res.status).toBe(503);
    expect((await res.json()).message).toContain('사진 없이');
  });

  it('사진이 없으면 지금처럼 JSON 으로 받는다', async () => {
    const res = await POST(new Request('http://localhost/api/inquiries', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(SUPPORT),
    }));
    expect(res.status).toBe(201);
    expect(db.inquiry.create.mock.calls[0]?.[0].data).not.toHaveProperty('images');
  });
});
