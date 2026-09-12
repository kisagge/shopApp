import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 자기 껍데기를 가진 구역은 자기 오류 경계를 갖는다.
 *
 * 오류 경계는 **가장 가까운 것이 잡는다.** 구역에 경계가 없으면 루트가 잡고,
 * 그러면 그 구역의 레이아웃까지 통째로 대체된다 — 어드민에서 오류가 나면
 * 사이드바가 사라져 운영진이 다른 일을 이어 갈 방법이 없어진다.
 *
 * 그리고 **구역마다 할 말이 다르다.** 루트는 "다시 시도" 를 준다. 다른
 * 화면에서는 그것이 맞지만 결제 화면에서는 틀린 안내다 — 주문이 이미
 * 만들어졌을 수 있고, 다시 시도하면 같은 물건을 두 번 사게 된다.
 *
 * 화면을 훑는 검사로는 안 잡힌다. 오류 경계는 **오류가 나야** 보이는데,
 * 훑기는 멀쩡한 화면만 지나간다.
 */

import { APP, appFile } from './app-routes';

/**
 * 그룹 폴더는 주소에 안 들어가므로 **구역 이름에서도 뺀다.**
 * `(shop)/mypage` 가 아니라 `mypage` 다 — 주소가 그러니까.
 */
const asRoute = (path: string): string =>
  relative(APP, path)
    .split('/')
    .filter((segment) => !segment.startsWith('('))
    .join('/');

/**
 * 경계를 따로 두지 않아도 되는 구역과 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'mypage':
    '매장 껍데기(머리말·꼬리말)만 쓰고 자기 메뉴가 없다. 한 단 위의 경계가 잡아도 사용자가 잃는 것이 없다.',
  '':
    '그룹 폴더 자체다. 주소에 안 들어가고, 매장 껍데기를 두르는 것이 하는 일의 전부다.',
};

/** layout.tsx 를 가진 폴더 = 자기 껍데기를 가진 구역 */
function segmentsWithLayout(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (!statSync(full).isDirectory()) continue;
    if (existsSync(join(full, 'layout.tsx'))) found.push(full);
    found.push(...segmentsWithLayout(full));
  }
  return found;
}

describe('구역마다 오류 경계', () => {
  const segments = segmentsWithLayout(APP);

  it('구역을 실제로 찾아냈다', () => {
    // 폴더를 못 읽으면 아래가 조용히 통과한다. 지금 셋이다.
    expect(segments.length).toBeGreaterThanOrEqual(3);
  });

  it('루트에는 두 겹이 다 있다', () => {
    // global-error 는 레이아웃까지 깨졌을 때, error 는 화면 하나가 깨졌을 때
    expect(existsSync(join(APP, 'error.tsx'))).toBe(true);
    expect(existsSync(join(APP, 'global-error.tsx'))).toBe(true);
  });

  it.each(segments.map((s) => [relative(APP, s), s] as const))(
    '%s 에 오류 경계가 있다',
    (rel, dir) => {
      if (asRoute(dir) in EXEMPT) return;
      expect(
        existsSync(join(dir, 'error.tsx')),
        `${rel} 는 자기 레이아웃이 있는데 오류 경계가 없다. 한 단 위가 잡으면 그 레이아웃까지 ` +
          '사라진다 — error.tsx 를 두거나, 필요 없는 이유를 EXEMPT 에 적는다.',
      ).toBe(true);
    },
  );

  it('면제한 구역은 실제로 있고 이유가 적혀 있다', () => {
    const routes = new Set(segments.map(asRoute));
    for (const [route, reason] of Object.entries(EXEMPT)) {
      expect(routes.has(route), `${route} 는 이제 자기 껍데기가 없다 — 면제도 지운다`).toBe(true);
      expect(reason.trim().length, route).toBeGreaterThan(20);
    }
  });

  /**
   * 결제 화면은 **다시 시도를 권하지 않는다.**
   *
   * 주문 만들기와 결제 승인은 서로 다른 요청이고, 그 사이 어디에서 깨졌는지
   * 화면은 알 수 없다. 이미 만들어진 주문을 다시 넣으면 같은 물건을 두 번
   * 사게 된다.
   */
  it('결제 경계는 다시 시도 대신 확인으로 보낸다', () => {
    const source = readFileSync(appFile('/checkout', 'error.tsx'), 'utf8');
    expect(source, '주문 내역으로 데려가지 않는다').toContain('/mypage/orders');
    expect(source, '결제 화면에서 reset() 을 권하면 두 번 사게 된다').not.toContain('reset()');
  });
});
