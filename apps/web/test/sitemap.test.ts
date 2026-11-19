import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * sitemap.xml — **검색이 우리를 찾는 유일한 지도.**
 *
 * 검사가 한 줄도 없었다. 여기서 틀려도 손님 화면은 멀쩡하고 오류도 안 나므로,
 * 아무도 알려 주지 않는다. 틀리는 방향이 둘인데 둘 다 값이 크다.
 *
 * **새어 나가는 쪽** — 숨긴 상품·끝난 기획전·정지된 가맹점의 주소가 들어가면
 * 검색에서 들어온 손님이 404 를 만난다. 지도를 보고 왔는데 없는 가게다.
 *
 * **빠지는 쪽** — 열려 있고 `noindex` 도 아닌 화면이 지도에만 없으면 영영 안
 * 걸린다. 하위 갈래 여덟 개가 실제로 그렇게 빠져 있었다.
 */

const getAllProductSlugs = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getIndexableCategorySlugs = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getLiveCollections = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getSellableBrandSlugs = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getNotices = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

vi.mock('~/lib/queries/catalog/products', () => ({ getAllProductSlugs, getIndexableCategorySlugs }));
vi.mock('~/lib/queries/catalog/collections', () => ({ getLiveCollections }));
vi.mock('~/lib/queries/catalog/brands', () => ({ getSellableBrandSlugs }));
vi.mock('~/lib/queries/support', () => ({ getNotices }));

const mod = await import('~/app/sitemap');
const sitemap = mod.default;

const PRODUCT = { slug: 'oat-coat', updatedAt: new Date('2026-10-02T00:00:00Z') };

beforeEach(() => {
  vi.clearAllMocks();
  getAllProductSlugs.mockResolvedValue([PRODUCT]);
  getIndexableCategorySlugs.mockResolvedValue(['outer', 'outer-coat']);
  getLiveCollections.mockResolvedValue([{ slug: 'winter-outer' }]);
  getSellableBrandSlugs.mockResolvedValue(['studio-noon']);
  getNotices.mockResolvedValue([]);
});

const paths = async () =>
  (await sitemap()).map((entry) => new URL(entry.url).pathname);

describe('매대에 보이는 것만 넣는다', () => {
  /*
   * **조회를 여기서 다시 적지 않는다.** 스토어프론트가 쓰는 그 조회를 그대로
   * 부르기 때문에 "숨긴 것은 안 나온다" 가 저절로 지켜진다 — 여기서 조건을 따로
   * 세우기 시작하면 그 둘이 갈리는 날 숨긴 상품의 주소가 지도에 남는다.
   */
  it('다섯 조회를 모두 부른다 — 하나라도 빠지면 그 갈래가 지도에 없다', async () => {
    await sitemap();

    expect(getAllProductSlugs).toHaveBeenCalledOnce();
    expect(getIndexableCategorySlugs).toHaveBeenCalledOnce();
    expect(getLiveCollections).toHaveBeenCalledOnce();
    expect(getSellableBrandSlugs).toHaveBeenCalledOnce();
    expect(getNotices).toHaveBeenCalledOnce();
  });

  it.each([
    ['상품', '/product/oat-coat'],
    ['갈래', '/category/outer'],
    ['브랜드', '/brand/studio-noon'],
    ['기획전', '/collection/winter-outer'],
  ])('%s 가 그 조회에서 온 주소로 들어간다', async (_what, path) => {
    expect(await paths()).toContain(path);
  });

  it('하위 갈래까지 넣는다 — 최상위만 쓰면 열려 있는 화면이 지도에만 없다', async () => {
    expect(await paths()).toContain('/category/outer-coat');
  });

  it('조회가 빈 목록을 주면 그 갈래의 주소도 없다 — 숨긴 것이 새지 않는다', async () => {
    getAllProductSlugs.mockResolvedValue([]);
    getLiveCollections.mockResolvedValue([]);
    getSellableBrandSlugs.mockResolvedValue([]);
    getIndexableCategorySlugs.mockResolvedValue([]);

    const list = await paths();

    expect(list.some((p) => p.startsWith('/product/'))).toBe(false);
    expect(list.some((p) => p.startsWith('/collection/'))).toBe(false);
    expect(list.some((p) => p.startsWith('/brand/'))).toBe(false);
    expect(list.some((p) => p.startsWith('/category/'))).toBe(false);
  });

  it('그래도 고정 화면은 남는다 — 지도가 비면 아무것도 안 걸린다', async () => {
    getAllProductSlugs.mockResolvedValue([]);
    getLiveCollections.mockResolvedValue([]);
    getSellableBrandSlugs.mockResolvedValue([]);
    getIndexableCategorySlugs.mockResolvedValue([]);

    expect(await paths()).toEqual(
      expect.arrayContaining(['/', '/categories', '/collections', '/grades', '/support', '/support/notice']),
    );
  });

  it('검색 화면은 넣지 않는다 — 검색어마다 다른 주소가 되어 같은 상품이 여러 번 잡힌다', async () => {
    const list = await paths();

    expect(list.some((p) => p.startsWith('/search'))).toBe(false);
  });

  it('같은 주소를 두 번 넣지 않는다', async () => {
    const list = await paths();

    expect(list).toEqual([...new Set(list)]);
  });
});

describe('언제 바뀌었다고 말하는가', () => {
  /*
   * **전부에 오늘을 찍으면 아무 뜻이 없다.** 매일 전부 바뀌었다고 말하는 셈이라
   * 크롤러가 그 값을 아예 믿지 않게 되고, 정말로 고친 상품도 늦게 다시 읽힌다.
   */
  it('상품은 그 상품이 바뀐 때로 적는다', async () => {
    const entry = (await sitemap()).find((e) => e.url.endsWith('/product/oat-coat'));

    expect(entry?.lastModified).toEqual(PRODUCT.updatedAt);
  });

  it('공지 목록은 가장 최근 공지의 게시일로 적는다', async () => {
    const latest = new Date('2026-11-01T00:00:00Z');
    getNotices.mockResolvedValue([
      { id: 'n-2', publishedAt: latest },
      { id: 'n-1', publishedAt: new Date('2026-01-01T00:00:00Z') },
    ]);

    const entry = (await sitemap()).find((e) => e.url.endsWith('/support/notice'));

    expect(entry?.lastModified).toEqual(latest);
  });

  it('공지가 없으면 목록은 오늘로 적는다 — 빈 값을 내보내지 않는다', async () => {
    getNotices.mockResolvedValue([]);

    const entry = (await sitemap()).find((e) => e.url.endsWith('/support/notice'));

    expect(entry?.lastModified).toBeInstanceOf(Date);
  });

  it('공지 한 건은 저마다 자기 게시일이고, 없으면 오늘이다', async () => {
    getNotices.mockResolvedValue([
      { id: 'n-2', publishedAt: new Date('2026-11-01T00:00:00Z') },
      { id: 'n-1', publishedAt: null },
    ]);

    const list = await sitemap();

    expect(list.find((e) => e.url.endsWith('/support/notice/n-2'))?.lastModified)
      .toEqual(new Date('2026-11-01T00:00:00Z'));
    expect(list.find((e) => e.url.endsWith('/support/notice/n-1'))?.lastModified)
      .toBeInstanceOf(Date);
  });
});

describe('지도의 모양', () => {
  it('모든 주소가 절대 주소다 — 상대 주소는 사이트맵에서 쓸 수 없다', async () => {
    const list = await sitemap();

    expect(list.length).toBeGreaterThan(0);
    for (const entry of list) {
      expect(() => new URL(entry.url), `${entry.url} 는 절대 주소가 아니다`).not.toThrow();
      expect(entry.url).toMatch(/^https?:\/\//);
    }
  });

  it('우선순위는 0 과 1 사이다 — 벗어난 값은 무시된다', async () => {
    for (const entry of await sitemap()) {
      expect(entry.priority, entry.url).toBeGreaterThan(0);
      expect(entry.priority, entry.url).toBeLessThanOrEqual(1);
    }
  });

  it('홈이 가장 높다', async () => {
    const list = await sitemap();
    const home = list.find((e) => new URL(e.url).pathname === '/');

    expect(home?.priority).toBe(1);
    for (const entry of list) {
      expect(entry.priority!).toBeLessThanOrEqual(home!.priority!);
    }
  });

  it('바뀜 빈도는 사이트맵이 아는 말만 쓴다', async () => {
    const KNOWN = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

    for (const entry of await sitemap()) {
      expect(KNOWN, entry.url).toContain(entry.changeFrequency);
    }
  });
});

describe('빌드가 DB 를 건드리지 않는다', () => {
  /*
   * **이 한 줄이 배포를 지킨다.** 없으면 이 파일이 빌드 중에 DB 를 치는 유일한
   * 자리가 되고, DB 가 잠깐 흔들리는 동안 **사이트맵 한 장 때문에 새 코드가 통째로
   * 못 나간다**(`Error occurred prerendering page "/sitemap.xml"`). 이 저장소가
   * ISR 을 쓰지 않기로 한 근거도 "빌드는 DB 를 건드리지 않는다" 였다.
   *
   * 지워도 단위 검사는 전부 통과하고 배포도 대개 성공한다 — DB 가 흔들리는 날에만
   * 드러난다. 그래서 글자로 재 둔다.
   */
  it('요청마다 만든다고 적혀 있다', () => {
    expect(mod.dynamic).toBe('force-dynamic');
  });

  it('그 선언이 소스에 그대로 있다 — 사라지면 빌드가 다시 DB 를 친다', () => {
    const source = readFileSync('src/app/sitemap.ts', 'utf8');

    expect(source).toContain("export const dynamic = 'force-dynamic'");
  });
});
