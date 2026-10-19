// @vitest-environment jsdom
import { render, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { returnAddressPath } from '~/lib/admin/return-address-path';
import { useLazySchema } from '~/lib/form-schema';

const db = vi.hoisted(() => ({ product: { findMany: vi.fn<(...a: any[]) => any>() } }));
vi.mock('@shop/db', () => ({ prisma: db }));

const { merchantOfProducts } = await import('~/lib/analytics/merchant-of');

/**
 * 작지만 두 곳 이상이 함께 쓰는 조각들. **한 곳만 고치면 갈리는** 자리라 그물을 친다.
 */

beforeEach(() => vi.clearAllMocks());

/**
 * 그 판매처의 **반품지를 등록하는 자리.**
 *
 * 가맹점 반품지는 그 가맹점 화면에서, 자사 상품을 받는 플랫폼 반품지는 배송 정책 화면에서
 * 등록한다. **두 곳이 이 주소를 각자 적고 있어서** 이 함수가 생겼다 — 한 곳만 고치면 알림을
 * 눌러 간 사람과 폼에서 눌러 간 사람이 서로 다른 화면에 도착한다.
 */
describe('반품지 등록 자리', () => {
  it('가맹점 것은 그 가맹점 화면이다', () => {
    expect(returnAddressPath('m-1')).toBe('/admin/merchants/m-1/return-address');
  });

  /** 자사 상품을 받는 곳은 가게 전체의 약속이라 배송비와 같은 자리에 있다 */
  it('자사 것은 배송 정책 화면이다', () => {
    expect(returnAddressPath(null)).toBe('/admin/shipping');
  });

  it('주소에 쓸 수 없는 글자는 감싼다', () => {
    expect(returnAddressPath('m 1/2')).toBe('/admin/merchants/m%201%2F2/return-address');
  });

  /*
   * **손으로 적은 자리가 남아 있으면 이 함수가 있으나 마나다.** 실제로 운영 화면 두 곳이
   * 아직 같은 주소를 손으로 짓고 있었다 — 값이 같아 조용했을 뿐이다.
   */
  it('그 주소를 손으로 짓는 자리가 없다', () => {
    const SRC = join(process.cwd(), 'src');
    const offenders: string[] = [];

    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(name) || full.endsWith('return-address-path.ts')) continue;
        const code = readFileSync(full, 'utf8');
        if (/\/admin\/merchants\/\$\{[^}]+\}\/return-address/.test(code)) {
          offenders.push(full.replace(SRC, ''));
        }
      }
    };
    walk(SRC);

    expect(offenders, 'returnAddressPath 를 쓰지 않고 주소를 손으로 짓는다').toEqual([]);
  });
});

/**
 * 상품 id → 그 상품을 파는 가맹점 id.
 *
 * **한 번에 묶어 묻는다.** 이벤트는 최대 스무 개씩 오는데 하나씩 물으면 수집 창구가 화면보다
 * 느려진다 — 느려지면 브라우저가 떠날 때 보내는 것부터 잘린다.
 */
describe('상품의 가맹점 찾기', () => {
  const rows = (...pairs: [string, string | null][]) =>
    db.product.findMany.mockResolvedValue(
      pairs.map(([id, merchantId]) => ({ id, brand: { merchantId } })),
    );

  it('한 번에 묶어 묻는다 — 하나씩 묻지 않는다', async () => {
    rows(['p-1', 'm-1'], ['p-2', 'm-2']);

    await merchantOfProducts(['p-1', 'p-2']);

    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.product.findMany.mock.calls[0]![0].where).toEqual({ id: { in: ['p-1', 'p-2'] } });
  });

  it('상품마다 그 가맹점을 짝지어 준다', async () => {
    rows(['p-1', 'm-1'], ['p-2', 'm-2']);

    const map = await merchantOfProducts(['p-1', 'p-2']);

    expect(map.get('p-1')).toBe('m-1');
    expect(map.get('p-2')).toBe('m-2');
  });

  /** 가맹점 없는 자체 상품은 null 이다 — 지도에 없는 것과 다른 말이다 */
  it('자사 상품은 null 로 둔다', async () => {
    rows(['p-1', null]);

    const map = await merchantOfProducts(['p-1']);

    expect(map.has('p-1')).toBe(true);
    expect(map.get('p-1')).toBeNull();
  });

  /** 못 찾은 상품은 지도에 없다 — 지워진 상품이 그렇다. 부르는 쪽이 null 로 둔다 */
  it('못 찾은 상품은 지도에 넣지 않는다', async () => {
    rows(['p-1', 'm-1']);

    const map = await merchantOfProducts(['p-1', '지워진것']);

    expect(map.has('지워진것')).toBe(false);
  });

  it('물을 것이 없어도 터지지 않는다', async () => {
    rows();

    expect((await merchantOfProducts([])).size).toBe(0);
  });
});

/**
 * 검증 스키마를 **첫 그림 뒤에** 받아 온다.
 *
 * 폼은 보내기 전에 스스로 거른다 — 그 판단은 그대로 둔다. 다만 그러자고 계약 패키지를 화면과
 * 함께 받으면 **Zod 가 384KB 째로 첫 그림을 막는다**(가입 화면이 1,180KB 였고 그중 384KB 가
 * 이것이었다). 그래서 늦게 받되, 누를 때까지 미루지 않는다.
 */
describe('스키마를 늦게 받기', () => {
  const Probe = ({ load, onReady }: { load: () => Promise<string>; onReady: (g: () => Promise<string>) => void }) => {
    const get = useLazySchema(load);
    onReady(get);
    return null;
  };

  it('화면이 그려진 뒤 조용히 받아 둔다', async () => {
    const load = vi.fn(async () => 'schema');

    render(<Probe load={load} onReady={() => undefined} />);

    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });

  /** 사람이 칸을 채우는 동안 도착한다 — 누르는 순간에는 이미 있다 */
  it('받아 둔 것을 그대로 돌려준다', async () => {
    const load = vi.fn(async () => 'schema');
    let get!: () => Promise<string>;

    render(<Probe load={load} onReady={(g) => { get = g; }} />);
    await waitFor(() => expect(load).toHaveBeenCalled());

    expect(await get()).toBe('schema');
  });

  /*
   * **한 번만 받는다.** `load` 는 매 렌더 새 함수라 의존성에 넣으면 매번 다시 부른다 —
   * 그러면 폼을 채우는 동안 같은 묶음을 몇 번이고 받는다.
   */
  it('여러 번 불러도 한 번만 받는다', async () => {
    const load = vi.fn(async () => 'schema');
    let get!: () => Promise<string>;

    render(<Probe load={load} onReady={(g) => { get = g; }} />);
    await waitFor(() => expect(load).toHaveBeenCalled());

    await Promise.all([get(), get(), get()]);

    expect(load).toHaveBeenCalledTimes(1);
  });

  /** 아직 안 왔으면 그때 기다린다 — 어차피 곧바로 요청을 보낼 참이다 */
  it('아직 안 왔으면 기다렸다 준다', async () => {
    let settle!: (v: string) => void;
    const load = vi.fn(() => new Promise<string>((resolve) => { settle = resolve; }));
    let get!: () => Promise<string>;

    render(<Probe load={load} onReady={(g) => { get = g; }} />);
    await waitFor(() => expect(load).toHaveBeenCalled());

    const waiting = get();
    settle('schema');

    expect(await waiting).toBe('schema');
  });
});
