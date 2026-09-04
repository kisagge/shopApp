import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RATE_LIMIT } from '@shop/core';
import { setRateLimiterForTest } from '~/lib/rate-limit';
import { MAX_RECENT } from '~/stores/recently-viewed';

const findMany = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({ prisma: { product: { findMany } } }));
vi.mock('@shop/auth/session', () => ({ getSessionUser: vi.fn(async () => null) }));

const { GET } = await import('~/app/api/products/recent/route');

const row = (slug: string) => ({
  id: `p-${slug}`,
  slug,
  name: slug,
  listPrice: 100_000,
  salePrice: null,
  ratingSum: 0,
  reviewCount: 0,
  publishedAt: new Date('2020-01-01'),
  brand: { name: 'BRAND' },
  images: [],
  variants: [{ stock: 3 }],
});

/** 요청한 slug 를 **뒤섞어** 돌려준다 — DB 는 순서를 지켜 주지 않는다 */
function respondShuffled() {
  findMany.mockImplementation(async ({ where }: any) => {
    const asked: string[] = [...where.slug.in];
    return asked.reverse().map(row);
  });
}

const call = (query: string) =>
  GET(new Request(`http://localhost:3000/api/products/recent?${query}`));

const slugsOf = async (res: Response) =>
  ((await res.json()) as { products: { slug: string }[] }).products.map((p) => p.slug);

beforeEach(() => {
  findMany.mockReset().mockResolvedValue([]);
  // 셈을 매번 새로 시작한다. 두지 않으면 테스트가 늘수록 뒤의 것이 막힌다.
  setRateLimiterForTest(null);
});
afterEach(() => setRateLimiterForTest(null));

describe('최근 본 상품 조회', () => {
  it('준 순서대로 돌려준다 — 이 목록은 순서가 곧 내용이다', async () => {
    respondShuffled();
    expect(await slugsOf(await call('slugs=a,b,c'))).toEqual(['a', 'b', 'c']);
  });

  it('slugs 가 없으면 DB 를 건드리지 않는다', async () => {
    expect(await slugsOf(await call(''))).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('내려간 상품은 조용히 빠진다 — 목록이 통째로 비지 않는다', async () => {
    // 어제 본 상품이 오늘 판매 중지됐을 때다
    findMany.mockResolvedValue([row('b')]);
    expect(await slugsOf(await call('slugs=a,b,c'))).toEqual(['b']);
  });

  it('매대에 보이는 조건을 건다 — 숨긴 상품으로 들어가는 뒷문이 아니다', async () => {
    await call('slugs=a');

    const where = findMany.mock.calls[0]![0].where;
    expect(where.deletedAt).toBeNull();
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.status.in).not.toContain('HIDDEN');
    // 정지된 가맹점의 상품도 함께 막힌다
    expect(where.brand).toBeDefined();
  });

  it('요청이 잦으면 막는다 — 로그인 없이 열려 있는 창구다', async () => {
    const policy = RATE_LIMIT.catalog;
    for (let i = 0; i < policy.limit; i += 1) await call('slugs=a');

    const blocked = await call('slugs=a');

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('retry-after')).toBeTruthy();
  });

  it('막을 요청이면 DB 를 건드리지 않는다', async () => {
    /*
     * 제한을 뒤에 두면 막으려던 요청이 일을 다 하고 나서 429 를 받는다.
     * 다른 창구에서 그렇게 만들어 두었다가 고친 적이 있다.
     */
    for (let i = 0; i < RATE_LIMIT.catalog.limit; i += 1) await call('slugs=a');
    findMany.mockClear();

    await call('slugs=a');

    expect(findMany).not.toHaveBeenCalled();
  });

  describe('주소로 들어오는 값', () => {
    it('들고 있는 개수만큼만 본다', async () => {
      const many = Array.from({ length: MAX_RECENT + 20 }, (_, i) => `s${i}`);
      await call(`slugs=${many.join(',')}`);

      expect(findMany.mock.calls[0]![0].where.slug.in).toHaveLength(MAX_RECENT);
    });

    it.each([
      ['경로 타기', '../../etc/passwd'],
      ['태그', '<script>'],
      ['대문자·공백', 'Wool Coat'],
      ['너무 긴 것', 'a'.repeat(200)],
    ])('%s 는 버린다', async (_label, bad) => {
      expect(await slugsOf(await call(`slugs=${encodeURIComponent(bad)}`))).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('멀쩡한 것만 골라 남긴다', async () => {
      respondShuffled();
      expect(await slugsOf(await call('slugs=wool-coat,<bad>,knit-2'))).toEqual([
        'wool-coat',
        'knit-2',
      ]);
    });

    it('빈 칸은 세지 않는다', async () => {
      await call('slugs=a,,%20,b');
      expect(findMany.mock.calls[0]![0].where.slug.in).toEqual(['a', 'b']);
    });
  });
});
