import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 캐시와 무효화가 짝을 이루는지 지킨다.
 *
 * **캐싱은 잘못돼도 조용하다.** 무효화를 빠뜨리면 화면이 낡은 값을 보여
 * 주는데, 개발 중에는 캐시가 비어 있어 아무 일도 안 일어나고 배포한 뒤에야
 * "왜 안 바뀌지" 가 된다. 요청 제한을 목록으로 지킨 것과 같은 이유다.
 *
 * 그리고 그보다 위험한 것 — **사용자마다 다른 값을 캐싱하는 것**이다.
 * 한 사람의 화면이 다음 사람에게 그대로 나간다.
 */

const SRC = join(process.cwd(), 'src');
const read = (rel: string) => readFileSync(join(SRC, rel), 'utf8');

/** 캐싱해야 하는 공개 조회 */
const CACHED_READS = [
  'lib/queries/catalog/products.ts',
  'lib/queries/catalog/search.ts',
  'lib/queries/catalog/suggest.ts',
  'lib/queries/catalog/recommend.ts',
  'lib/queries/catalog/collections.ts',
  'lib/queries/catalog/brands.ts',
  'lib/queries/reviews.ts',
  'lib/admin/manage-banner.ts',
  'lib/queries/support.ts',
] as const;

/** 카탈로그를 털어야 하는 쓰기 창구 */
const CATALOG_WRITERS = [
  'app/api/admin/products/route.ts',
  'app/api/admin/products/[id]/route.ts',
  'app/api/admin/products/[id]/stock/route.ts',
  'app/api/admin/products/[id]/variants/route.ts',
  'app/api/admin/products/[id]/review/route.ts',
  'app/api/admin/products/[id]/images/route.ts',
  'app/api/admin/products/[id]/images/[imageId]/route.ts',
  /*
   * **주문도 카탈로그를 바꾼다.** 예전에는 이 셋이 빠져 있어서, 마지막 한
   * 장이 팔린 뒤에도 캐시 수명만큼 재고 있는 것으로 보였다. 초과 판매로는
   * 이어지지 않지만(주문을 만들 때 서버가 다시 본다) 고른 사람이 결제
   * 직전에 막힌다 — 그리고 캐시 수명을 늘리는 순간 그 창이 그만큼 길어진다.
   */
  'app/api/orders/route.ts',
  'app/api/orders/[orderNo]/cancel/route.ts',
  'app/api/admin/orders/[orderNo]/status/route.ts',
] as const;

const BANNER_WRITERS = [
  'app/api/admin/banners/route.ts',
  'app/api/admin/banners/[id]/route.ts',
  'app/api/admin/banners/[id]/image/route.ts',
] as const;

/**
 * 기획전 쓰기 창구.
 *
 * 기획전 조회는 `collections` 와 `catalog` 두 태그를 함께 단다 — 담긴 수는
 * 상품이 내려가도 달라지므로, 상품을 고쳤을 때도 함께 털려야 한다.
 */
const COLLECTION_WRITERS = [
  'app/api/admin/collections/route.ts',
  'app/api/admin/collections/[id]/route.ts',
  'app/api/admin/collections/[id]/items/route.ts',
  'app/api/admin/collections/[id]/image/route.ts',
] as const;

/**
 * 배치도 카탈로그를 턴다.
 *
 * 결제 대기 주문을 풀면 **재고가 늘어난다** — 품절로 보이던 것이 다시
 * 보여야 하는데, 캐시를 그대로 두면 최대 캐시 수명만큼 품절인 채로 남는다.
 * 사람이 누른 것이 아니라 배치가 한 일이라 아무도 새로고침하지 않는다.
 */
const CRON_WRITERS = ['app/api/cron/release-holds/route.ts'] as const;

/** 별점이 목록에 나오므로 리뷰 쓰기도 카탈로그를 턴다 */
const REVIEW_WRITERS = [
  'app/api/reviews/route.ts',
  'app/api/reviews/[id]/route.ts',
  'app/api/admin/reviews/[id]/restore/route.ts',
] as const;

/** 공지·FAQ 를 털어야 하는 쓰기 창구 */
const SUPPORT_WRITERS = [
  'app/api/admin/support/route.ts',
  'app/api/admin/support/[id]/route.ts',
] as const;

describe('캐싱한 자리', () => {
  it.each(CACHED_READS)('%s 가 캐시를 쓴다', (rel) => {
    expect(read(rel)).toContain('cachedRead');
  });

  it('사용자별 조회는 캐싱하지 않는다', () => {
    /*
     * getProductReviews 는 viewerId 를 받아 "내 리뷰인지" 를 담는다.
     * 이것이 캐시에 들어가면 남의 화면이 그대로 나간다.
     */
    const source = read('lib/queries/reviews.ts');
    const cachedAt = source.indexOf('cachedRead(');
    const viewerAt = source.indexOf('viewerId');

    expect(cachedAt).toBeGreaterThan(-1);
    // viewerId 를 쓰는 함수가 캐시 감싸개보다 앞에 있어야 한다
    expect(viewerAt).toBeLessThan(cachedAt);
  });

  it('어드민 조회는 캐싱하지 않는다 — 운영자는 방금 바꾼 값을 봐야 한다', () => {
    for (const f of readdirSync(join(SRC, 'lib/queries/admin'))) {
      expect(read(join('lib/queries/admin', f))).not.toContain('cachedRead');
    }
    expect(read('lib/queries/admin-reviews.ts')).not.toContain('cachedRead');
  });

  it('고객센터도 운영진 목록만은 캐싱하지 않는다 — 초안이 보여야 고친다', () => {
    const source = read('lib/queries/support.ts');
    const adminAt = source.indexOf('getAdminSupportPosts');
    // 어드민 조회는 마지막에 있고, 그 뒤로는 캐시 감싸개가 없어야 한다
    expect(adminAt).toBeGreaterThan(-1);
    expect(source.slice(adminAt)).not.toContain('cachedRead');
  });

  it('마이페이지 조회도 캐싱하지 않는다', () => {
    expect(read('lib/queries/mypage.ts')).not.toContain('cachedRead');
  });
});

describe('무효화한 자리', () => {
  it.each(CATALOG_WRITERS)('%s 가 카탈로그를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateCatalog()');
  });

  it.each(BANNER_WRITERS)('%s 가 배너를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateBanners()');
  });

  it.each(CRON_WRITERS)('%s 가 카탈로그를 턴다 — 재고가 늘었다', (rel) => {
    expect(read(rel)).toContain('revalidateCatalog()');
  });

  it.each(COLLECTION_WRITERS)('%s 가 기획전을 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateCollections()');
  });

  it.each(REVIEW_WRITERS)('%s 가 리뷰를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateReviews()');
  });

  it.each(SUPPORT_WRITERS)('%s 가 공지·FAQ 를 턴다', (rel) => {
    expect(read(rel)).toContain('revalidateSupport()');
  });

  it('무효화를 부르는 라우트는 전부 목록에 있다', () => {
    // 반대 방향도 지킨다. 목록에 없는데 부르면 목록이 낡은 것이다.
    const listed = new Set<string>([
      ...CATALOG_WRITERS,
      ...BANNER_WRITERS,
      ...COLLECTION_WRITERS,
      ...CRON_WRITERS,
      ...REVIEW_WRITERS,
      ...SUPPORT_WRITERS,
    ]);
    const found: string[] = [];

    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
        else if (name === 'route.ts' && readFileSync(full, 'utf8').includes('~/lib/cache')) {
          found.push(`app/api/${prefix}${name}`);
        }
      }
    };
    walk(join(SRC, 'app', 'api'), '');

    expect(found.filter((f) => !listed.has(f))).toEqual([]);
  });
});

/**
 * 캐시 수명.
 *
 * **신선도는 이 값이 아니라 무효화가 지킨다.** 그래서 짧게 잡을 이유가 없고,
 * 짧게 잡으면 트래픽이 뜸한 곳에서 거의 모든 방문자가 만료된 캐시를 만나
 * **자는 DB 를 깨운다** — 운영에서 재 보니 그 값이 1.5초였다.
 *
 * 되돌아오기 쉬운 종류다. "캐시는 짧게" 가 손에 익은 규칙이라, 다음 사람이
 * 60초로 되돌려 놓고 왜 느려졌는지 모를 수 있다.
 */
describe('캐시 수명', () => {
  const source = readFileSync(join(SRC, 'lib/cache.ts'), 'utf8');
  const ttls = [...source.matchAll(/^\s*(catalog|banners|collections|support): (\d+),/gm)];

  it('네 값을 모두 찾았다 — 검사가 헛돌지 않게', () => {
    expect(ttls).toHaveLength(4);
  });

  it.each(ttls.map((m) => [m[1]!, Number(m[2])]))(
    '%s 는 짧게 잡지 않는다',
    (_name, seconds) => {
      // 5분이면 앞사람이 다녀갔을 가능성이 거의 없다. 그보다는 길어야 한다.
      expect(seconds).toBeGreaterThanOrEqual(600);
    },
  );
});

/**
 * 레이아웃이 던지는 질의.
 *
 * **어느 화면을 열든 지나간다.** 그래서 여기 하나가 캐시를 안 거치면 화면별
 * 캐시를 아무리 잘 잡아도 소용이 없다 — 첫 요청이 그 질의로 자는 DB 를
 * 깨우고, 방문자는 1.5초를 기다린다.
 *
 * 실제로 그랬다. 카탈로그 캐시를 한 시간으로 늘렸더니 상품 상세는 3.25초에서
 * 0.30초가 됐는데 **홈만 3.7초 그대로**였고, 원인이 헤더의 카테고리 목록이었다.
 * React 의 `cache` 로만 감싸 두어서 한 요청 안의 중복만 막고 요청 사이에는
 * 남지 않았다.
 */
describe('레이아웃 질의', () => {
  const source = readFileSync(join(SRC, 'lib/queries/catalog/products.ts'), 'utf8');

  it('최상위 카테고리는 요청 사이에도 남는다', () => {
    // cache() 만으로는 모자란다. cachedRead 를 함께 거쳐야 한다.
    expect(source).toMatch(/cachedRead\([\s\S]{0,600}?parentId: null/);
  });

  it('한 요청 안의 중복도 계속 막는다 — 헤더와 푸터가 같은 목록을 쓴다', () => {
    expect(source).toMatch(/getTopCategories = cache\(/);
  });
});
