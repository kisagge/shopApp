import { test, expect } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { E2E_CRON_SECRET } from './state';

/**
 * 배치의 문이 닫혀 있는가.
 *
 * `/api/cron/*` 는 **쿠키 없이 도는 자리**다. 적립을 지급하고(auto-confirm), 포인트를 소멸시키고
 * (expire-points), 정산을 확정하고(settlements), 잡아 둔 재고를 푼다(release-holds). 인증이 새면 누구든
 * 주소만 알면 남의 포인트를 태우고 정산을 얼릴 수 있다.
 *
 * 열쇠 판정(authorizeCron)은 단위 검사가 보지만, **선 서버에서 그 판정을 실제로 지나는지**는 아무도 안 봤다.
 * 라우트 하나가 authorizeCron 을 빠뜨려도 단위 검사는 아무 말도 하지 않는다 — 부르지 않은 함수는 검사하지
 * 않으므로. 그래서 여기서는 **폴더를 훑어** 배치 하나하나를 손수 두드린다: 새 배치를 만들면 목록에 적지
 * 않아도 저절로 이 검사를 받는다.
 */

// 명세는 ESM 으로 돈다 — __dirname 이 없다(test/ 의 가드들과 다른 점이다)
const CRON_DIR = join(import.meta.dirname, '..', 'src', 'app', 'api', 'cron');
const ROUTES = readdirSync(CRON_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => `/api/cron/${e.name}`)
  .sort();

test('배치 폴더를 실제로 훑었다 — 빈 목록이면 아래 검사가 전부 통과한다', () => {
  expect(ROUTES.length).toBeGreaterThanOrEqual(5);
});

for (const route of ROUTES) {
  test(`${route} — 열쇠 없이는 열리지 않는다`, async ({ request }) => {
    const anonymous = await request.get(route, { failOnStatusCode: false });
    expect(anonymous.status(), `${route} 가 열쇠 없이 돌았다`).toBe(401);

    /*
     * 엉뚱한 열쇠도 같다. **길이가 같은 것과 다른 것을 모두 본다** — 판정이 길이부터 보고 갈라지므로
     * (timingSafeEqual 은 길이가 다르면 던진다) 한쪽만 두드리면 다른 쪽 길은 한 번도 안 지난다.
     * 값은 ASCII 로만 적는다: 헤더에 한글을 실으면 요청이 아예 나가지 않아, 막혔는지 보낸 적도 없는지
     * 구분이 안 된다(한 판이 그렇게 지나갔다).
     */
    for (const token of ['x'.repeat(E2E_CRON_SECRET.length), 'short']) {
      const wrong = await request.get(route, {
        headers: { authorization: `Bearer ${token}` },
        failOnStatusCode: false,
      });
      expect(wrong.status(), `${route} 가 엉뚱한 열쇠(${token.length}자)로 돌았다`).toBe(401);
    }

    // 막힌 응답은 무엇이 틀렸는지 말하지 않는다 — 열쇠가 있는지조차 알려 줄 것이 아니다
    expect(await anonymous.json()).toEqual({ code: 'UNAUTHORIZED', message: '인증되지 않은 요청입니다.' });
  });
}

/**
 * 열쇠가 맞으면 실제로 돈다. 막는 것만 보면 "전부 401" 로도 통과한다 — 그건 배치가 죽은 것이다.
 *
 * 하루치 정리 배치를 고른다: 돈도 재고도 건드리지 않고(어제까지의 이벤트를 접고 오래된 알림을 지운다),
 * 여러 번 돌아도 결과가 같아 다른 명세를 흔들지 않는다.
 */
test('열쇠가 맞으면 배치가 돌고, 두 번 돌려도 같은 답을 준다', async ({ request }) => {
  const call = () => request.get('/api/cron/rollup-events', {
    headers: { authorization: `Bearer ${E2E_CRON_SECRET}` },
    failOnStatusCode: false,
  });

  const first = await call();
  expect(first.status(), await first.text()).toBe(200);
  const body = (await first.json()) as Record<string, unknown>;
  expect(Object.keys(body).length, '배치가 무엇을 했는지 답하지 않는다').toBeGreaterThan(0);

  const again = await call();
  expect(again.status()).toBe(200);
  expect(await again.json()).toEqual(body);
});
