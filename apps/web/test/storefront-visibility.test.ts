import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const db = vi.hoisted(() => ({
  product: {
    findMany: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({
  prisma: db,
  Prisma: {},
}));

const { getFeaturedProducts, getProductBySlug, getAllProductSlugs } =
  await import('~/lib/queries/catalog/products');

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([]);
  db.product.findFirst.mockResolvedValue(null);
});

/**
 * 매대에 무엇이 보이는가는 **한 곳에서 정한다.**
 *
 * 손으로 적어 두었더니 목록과 검색에는 상태 조건이 있는데 상세와 정적
 * 경로에는 빠져 있었다. 숨긴 상품이 주소로는 그대로 열렸다 — 회수한
 * 상품이나 잘못된 가격을 내려도 링크를 가진 사람에게는 계속 보인다.
 */
const VISIBLE = ['ACTIVE', 'SOLD_OUT'];

describe('스토어프론트가 거르는 조건', () => {
  it('추천 목록', async () => {
    await getFeaturedProducts(10);

    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
    expect(where.publishedAt).toEqual({ not: null });
    expect(where.deletedAt).toBeNull();
  });

  it('상품 상세 — 주소를 직접 쳐도 막혀야 한다', async () => {
    await getProductBySlug('oat-coat');

    const where = db.product.findFirst.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
    expect(where.publishedAt).toEqual({ not: null });
  });

  it('정적 경로 생성 — 숨긴 상품의 주소를 만들지 않는다', async () => {
    await getAllProductSlugs();

    const where = db.product.findMany.mock.calls[0]![0].where;
    expect(where.status.in).toEqual(VISIBLE);
  });

  it('검수 대기와 숨김은 어디에도 들지 않는다', async () => {
    await Promise.all([
      getFeaturedProducts(10),
      getProductBySlug('oat-coat'),
      getAllProductSlugs(),
    ]);

    const wheres = [
      ...db.product.findMany.mock.calls.map((c: any[]) => c[0].where),
      ...db.product.findFirst.mock.calls.map((c: any[]) => c[0].where),
    ];
    expect(wheres).toHaveLength(3);
    for (const where of wheres) {
      expect(where.status.in).not.toContain('PENDING_REVIEW');
      expect(where.status.in).not.toContain('HIDDEN');
      expect(where.status.in).not.toContain('DRAFT');
    }
  });
});

/**
 * 위 세 검사는 **이름을 적어 둔 세 함수만** 본다.
 *
 * 이 파일 첫머리 주석에 "손으로 적어 두었더니 상세와 정적 경로에 조건이
 * 빠져 있었다" 고 적혀 있다. 그런데 그 뒤에 온 해법도 손 목록이었다 —
 * 카탈로그 조회는 일곱 모듈로 갈라졌고 상품을 읽는 자리는 아홉 군데다.
 *
 * 새 조회가 매대 조건을 빠뜨리면 **숨긴 상품이 주소로 열린다.** 회수한
 * 상품이나 잘못된 가격을 내려도 링크를 가진 사람에게는 계속 보인다.
 * 화면은 정상으로 보이므로 눈으로는 알 수 없다.
 *
 * 그래서 이름 대신 폴더를 본다.
 */
describe('카탈로그 조회는 빠짐없이 매대 조건을 쓴다', () => {
  const DIR = join(__dirname, '..', 'src', 'lib', 'queries', 'catalog');

  /**
   * 매대 조건을 쓰지 않아도 되는 자리와 그 이유.
   *
   * 이름만 적는 것은 목록으로 되돌아가는 것과 같다. 왜 빼는지가 남아 있어야
   * 나중에 그 판단이 아직 맞는지 볼 수 있다.
   */
  const EXEMPT: Readonly<Record<string, string>> = {
    'shelf.ts': '매대 조건을 정의하는 파일이다. 자기 자신을 쓸 수는 없다.',
  };

  const modules = readdirSync(DIR).filter((f) => f.endsWith('.ts') && !(f in EXEMPT));

  it('훑을 모듈이 실제로 있다', () => {
    // 폴더를 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(modules.length).toBeGreaterThanOrEqual(5);
  });

  it.each(modules)('%s 가 상품을 읽으면 onDisplay 를 거친다', (name) => {
    const source = readFileSync(join(DIR, name), 'utf8');

    /*
     * 주석을 걷어낸 뒤 센다. 주석 안의 예시 코드까지 세면 실제로는 없는
     * 조회를 있다고 보고, 반대로 주석에 적힌 onDisplay 를 근거로 삼는다.
     */
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    const reads = code.match(/prisma\.product\.(findMany|findFirst|findUnique|count)\b/g) ?? [];
    if (reads.length === 0) return;

    expect(
      code,
      `${name} 가 상품을 ${reads.length}번 읽는데 onDisplay 를 쓰지 않는다. ` +
        '매대 조건을 빼려면 EXEMPT 에 이유를 적는다.',
    ).toContain('onDisplay');
  });
});
