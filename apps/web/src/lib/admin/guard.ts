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

  if (!hasPermission(actor, permission)) {
    // 권한이 없다는 사실 자체를 알려 주지 않는다. 어드민 경로의 존재를
    // 확인해 주는 셈이 되기 때문이다.
    redirect('/');
  }
  return actor;
}
