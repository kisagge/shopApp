import { APIError } from 'better-auth/api';
import { prisma } from '@shop/db';

/** 로그인 화면이 알아보는 코드. 비밀번호가 틀렸다는 말과 구분해야 다시 시도하지 않는다 */
export const ACCOUNT_SUSPENDED = 'ACCOUNT_SUSPENDED';

/**
 * 정지된 회원에게 세션을 내주지 않는다.
 *
 * **세션을 만드는 자리에서 막는다.** 비밀번호 로그인·구글 로그인·가입 직후 자동 로그인이 모두 이
 * 한 곳을 지난다. 로그인 창구마다 검사를 붙이면 새 창구가 생길 때 빠진다.
 *
 * 비밀번호 확인이 끝난 뒤에 불린다 — 틀린 비밀번호로는 "정지됨" 을 볼 수 없어, 남의 주소를 넣어
 * 정지 여부를 캐낼 수 없다.
 */
export async function assertNotSuspended(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { suspendedAt: true } });
  if (user?.suspendedAt) {
    throw new APIError('FORBIDDEN', { code: ACCOUNT_SUSPENDED, message: '이용이 정지된 계정입니다.' });
  }
}
