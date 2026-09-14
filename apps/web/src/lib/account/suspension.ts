import 'server-only';
import { prisma } from '@shop/db';

/**
 * 이용 정지 여부를 DB 에서 본다.
 *
 * 정지하면 세션을 지우지만 세션 쿠키 캐시(5분)는 DB 를 안 보고 통과시킨다. 그 몇 분 동안 **돈이
 * 오가는 창구**(주문 생성)만은 열어 두지 않으려고 따로 묻는다. 나머지 쓰기는 캐시가 끝나면 막힌다.
 */
export async function isSuspended(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
  return user?.suspendedAt != null;
}
