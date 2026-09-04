import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { hasPermission, type Actor, type Permission } from '@shop/core';
import { getActor } from '@shop/auth/session';

/**
 * 어드민 진입 가드.
 *
 * **레이아웃에서 한 번, 동작마다 또 한 번 확인한다.** 레이아웃만 막으면
 * 메뉴는 안 보이는데 API 를 직접 치면 되는 구멍이 남는다. 이 함수는 화면용이고,
 * 쓰기 동작은 각 라우트에서 assertPermission 을 다시 부른다.
 */
export async function requireAdmin(permission: Permission = 'admin:access'): Promise<Actor> {
  const actor = await getActor(await headers());
  if (!actor) redirect('/login?next=/admin');

  /**
   * 콘솔 진입 권한을 **항상** 함께 본다.
   *
   * 예전에는 넘겨받은 권한만 확인했다. 그런데 CUSTOMER 도 order:read 와
   * product:read 를 갖고 있어서, 고객이 /admin/orders 를 열면 이 가드를
   * 그대로 통과했다. 화면은 레이아웃 리다이렉트가 막아 줬지만 **페이지는
   * 이미 DB 를 치고 그 뒤에서 던졌다** — 오류 추적을 붙이고 나서야 로그에
   * fatal 로 쌓이는 것을 보고 알았다.
   *
   * 두 권한은 뜻이 다르다. order:read 는 "주문을 볼 수 있다" 이고
   * admin:access 는 "운영 콘솔에 들어올 수 있다" 다. 고객은 앞의 것만 가진다.
   */
  const allowed = hasPermission(actor, 'admin:access') && hasPermission(actor, permission);
  if (!allowed) {
    // 권한이 없다는 사실 자체를 알려 주지 않는다. 어드민 경로의 존재를
    // 확인해 주는 셈이 되기 때문이다.
    redirect('/');
  }
  return actor;
}
