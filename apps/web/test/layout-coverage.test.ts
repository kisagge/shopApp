import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * 자리 훑기가 화면을 빠뜨리지 않게 지킨다.
 *
 * 접근성 훑기를 만들 때 목록을 손으로 적었다가 **열 장을 놓쳤고 그중에 결제
 * 화면이 있었다.** 그래서 그쪽은 파일 시스템에서 목록을 만들게 바꿨는데,
 * 자리 훑기를 새로 만들면서 **같은 실수를 다시 했다** — 손님 화면 열한 장만
 * 적어 두고 운영 화면 열여섯 장을 통째로 빠뜨렸다. 뒤늦게 넣어 보니 거기서
 * 결함이 셋 나왔다.
 *
 * 접근성 쪽과 같은 자리다. 새 화면을 더하면 훑기에 넣거나, 왜 넣지 않는지
 * 여기 적어야 한다.
 */

const WEB = resolve(import.meta.dirname, '..');
const APP = join(WEB, 'src/app');
const E2E = join(WEB, 'e2e');

/** 훑지 않는 화면과 그 이유. 이유 없이 빼지 못한다. */
const EXCLUDED: Readonly<Record<string, string>> = {
  '/checkout/success':
    '토스가 돌아오는 자리다. 열쇠 없이 열면 늘 /checkout/fail 로 넘기고, 그쪽은 훑는다.',
  '/offline':
    '서비스워커가 네트워크가 끊겼을 때만 꺼내는 화면이라 주소로 열어도 그 상태가 아니다.',
  '/account/closed': '탈퇴 직후에만 뜻이 있는 안내 한 장이다. 상자에 담긴 글자가 없다.',
};

/**
 * 동적 경로는 주소를 지어낼 수 없다. 대신 훑기가 **어떻게 그 화면에 닿는지**를
 * 여기 적는다 — 시드가 심어 둔 주소를 그대로 쓰거나, 목록에서 눌러 들어간다.
 *
 * 처음에는 동적 경로를 통째로 건너뛰었다. 그런데 거기에 주문 상세가 있었다 —
 * 상품·수량·할인·배송비가 한 표에 들어가는, 이 앱에서 표가 가장 빽빽한 화면이다.
 */
const DYNAMIC: Readonly<Record<string, string>> = {
  '/product/[slug]': '시드 상품 주소를 그대로 연다',
  '/category/[slug]': '시드 카테고리 주소를 그대로 연다',
  '/brand/[slug]': '시드 브랜드 주소를 그대로 연다',
  '/collection/[slug]': '시드 기획전 주소를 그대로 연다',
  '/support/notice/[id]': '시드 공지 주소를 그대로 연다',
  '/order/[orderNo]': '주문 목록에서 첫 줄을 눌러 들어간다',
  '/order/[orderNo]/receipt': 'partial-cancel 이 결제한 주문의 영수증을 네 폭으로 잰다',
  '/admin/orders/[orderNo]': '운영 주문 표에서 첫 줄을 눌러 들어간다',
  '/admin/products/[id]': '운영 상품 표에서 첫 줄을 눌러 들어간다',
  '/admin/users/[id]': '회원 표에서 첫 줄의 이름을 눌러 들어간다',
  '/admin/users/[id]/points': '회원 표에서 첫 줄의 포인트 잔액을 눌러 들어간다',
};

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      const segment = name.startsWith('(') ? '' : `/${name}`;
      return routes(full, prefix + segment);
    }
    return name === 'page.tsx' ? [prefix || '/'] : [];
  });
}

/** 자리 훑기가 실제로 여는 주소들 */
const swept = (): ReadonlySet<string> => {
  const files = readdirSync(E2E).filter((f) => f.startsWith('layout') && f.endsWith('.spec.ts'));
  const source = files.map((f) => readFileSync(join(E2E, f), 'utf8')).join('\n');
  const found = new Set<string>();
  for (const m of source.matchAll(/'(\/[^']*)'/g)) found.add(m[1]!.split('?')[0]!);
  return found;
};

describe('자리 훑기의 범위', () => {
  const all = routes(APP);

  it('화면을 실제로 찾는다 — 빈 목록이면 아래가 헛돈다', () => {
    expect(all.length).toBeGreaterThan(30);
    expect(swept().size).toBeGreaterThan(20);
  });

  it('정적 경로는 훑거나, 왜 안 훑는지 적혀 있다', () => {
    const covered = swept();
    const missing = all
      .filter((r) => !r.includes('['))
      .filter((r) => !covered.has(r) && !(r in EXCLUDED));

    expect(
      missing,
      '이 화면들의 자리를 아무도 재지 않는다.\n' +
        'e2e/layout*.spec.ts 에 넣거나, 왜 안 재는지 EXCLUDED 에 이유와 함께 적는다.',
    ).toEqual([]);
  });

  /** 동적 경로도 누가 재는지 적혀 있어야 한다. 통째로 건너뛰면 주문 상세가 샌다. */
  it('동적 경로도 어떻게 닿는지 적혀 있다', () => {
    const missing = all.filter((r) => r.includes('[')).filter((r) => !(r in DYNAMIC));

    expect(
      missing,
      '이 화면들은 동적 경로라 주소를 지어낼 수 없다.\n' +
        '훑기가 어떻게 닿는지(시드 주소·목록에서 누르기) DYNAMIC 에 적는다.',
    ).toEqual([]);
  });

  it('빼 둔 화면과 동적 경로가 전부 실제로 있다 — 목록만 남고 화면이 사라지면 안 된다', () => {
    const known = new Set(all);
    expect([...Object.keys(EXCLUDED), ...Object.keys(DYNAMIC)].filter((r) => !known.has(r)))
      .toEqual([]);
  });

  it('적어 둔 이유가 이름만 있는 것이 아니다', () => {
    expect(Object.entries(EXCLUDED).filter(([, why]) => why.trim().length < 20)).toEqual([]);
    expect(Object.entries(DYNAMIC).filter(([, how]) => how.trim().length < 10)).toEqual([]);
  });
});
