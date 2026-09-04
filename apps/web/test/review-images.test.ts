import { describe, it, expect, vi, beforeEach } from 'vitest';

const storage = vi.hoisted(() => ({
  put: vi.fn<(...a: any[]) => any>(),
  remove: vi.fn<(...a: any[]) => any>(),
  name: 'test',
}));
vi.mock('~/lib/storage', () => ({ getStorage: () => storage }));

const { uploadReviewImages, discardReviewImages } = await import('~/lib/reviews/images');

/** 진짜 PNG 매직 바이트. 형식 검사는 내용으로 한다. */
const png = () => {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  return { bytes, declaredType: 'image/png' };
};

/** HTML 을 png 라고 우겨 올리는 고전적인 시도 */
const html = () => ({
  bytes: new TextEncoder().encode('<!doctype html><script>alert(1)</script>'),
  declaredType: 'image/png',
});

beforeEach(() => {
  vi.clearAllMocks();
  let n = 0;
  storage.put.mockImplementation((input: { key: string }) => {
    n += 1;
    return Promise.resolve({ url: `https://cdn.test/${input.key}?n=${n}` });
  });
  storage.remove.mockResolvedValue(undefined);
});

describe('올리기', () => {
  it('없으면 저장소를 두드리지 않는다', async () => {
    expect(await uploadReviewImages('oi-1', [])).toEqual([]);
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('키가 리뷰 접두사와 주문 항목으로 묶인다', async () => {
    const out = await uploadReviewImages('oi-1', [png()]);

    expect(out).toHaveLength(1);
    expect(out[0]!.key).toMatch(/^reviews\/oi-1\/[A-Za-z0-9_-]+\.png$/);
    expect(out[0]!.url).toContain(out[0]!.key);
  });

  it('장마다 다른 키를 쓴다 — 같은 키면 서로 덮어쓴다', async () => {
    const out = await uploadReviewImages('oi-1', [png(), png(), png()]);
    expect(new Set(out.map((o) => o.key)).size).toBe(3);
  });

  it('한도를 넘으면 한 장도 올리지 않는다', async () => {
    const many = Array.from({ length: 6 }, png);

    await expect(uploadReviewImages('oi-1', many)).rejects.toMatchObject({
      code: 'TOO_MANY_REVIEW_IMAGES',
    });
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('내용이 이미지가 아니면 한 장도 올리지 않는다', async () => {
    // 선언된 형식을 믿지 않는다. 절반만 올린 뒤 거절하면 주인 없는 객체가 남는다.
    await expect(uploadReviewImages('oi-1', [png(), html()])).rejects.toThrow();
    expect(storage.put).not.toHaveBeenCalled();
  });

  it('도중에 실패하면 이미 올린 것을 되돌린다', async () => {
    storage.put
      .mockResolvedValueOnce({ url: 'https://cdn.test/a' })
      .mockRejectedValueOnce(new Error('저장소 오류'));

    await expect(uploadReviewImages('oi-1', [png(), png()])).rejects.toThrow('저장소 오류');
    expect(storage.remove).toHaveBeenCalledTimes(1);
  });
});

describe('되돌리기', () => {
  it('빈 목록이면 아무것도 하지 않는다', async () => {
    await discardReviewImages([]);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('실패해도 던지지 않는다 — 부르는 쪽은 이미 다른 오류를 처리 중이다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    storage.remove.mockRejectedValue(new Error('저장소 오류'));

    await expect(discardReviewImages(['k1', 'k2'])).resolves.toBeUndefined();
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('하나가 실패해도 나머지를 시도한다', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    storage.remove.mockRejectedValueOnce(new Error('오류')).mockResolvedValue(undefined);

    await discardReviewImages(['k1', 'k2', 'k3']);

    expect(storage.remove).toHaveBeenCalledTimes(3);
    err.mockRestore();
  });
});
