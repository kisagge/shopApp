import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import type { Actor } from '@shop/core';

/**
 * 크론 요청 인증.
 *
 * 배치 라우트는 세션 쿠키를 요구하는데 크론 요청에는 쿠키가 없다. 그렇다고
 * 인증을 빼면 **누구나 정산을 확정하고 포인트 잔액을 덮어쓸 수 있다.**
 * Vercel Cron 은 CRON_SECRET 이 설정돼 있으면 Authorization: Bearer 로 보낸다.
 */

export type CronAuth =
  | { ok: true; actor: Actor }
  | { ok: false; status: 401 | 503; code: string; message: string };

/** 배치가 감사 로그에 남길 행위자. 사람이 아니므로 별도 id 를 쓴다. */
export const CRON_ACTOR: Actor = {
  id: 'system:cron',
  role: 'SUPER_ADMIN',
  merchantId: null,
};

/** 길이가 달라도 안전하게 비교한다. 문자열 == 는 첫 불일치에서 끝나 길이가 새어 나간다. */
function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function authorizeCron(request: Request): CronAuth {
  const secret = process.env['CRON_SECRET'];

  // 시크릿이 없으면 **열어 두지 않고 막는다.** 설정을 빠뜨렸을 때
  // 조용히 무방비가 되는 쪽이 훨씬 나쁘다.
  if (!secret) {
    return {
      ok: false, status: 503, code: 'CRON_NOT_CONFIGURED',
      message: 'CRON_SECRET 이 설정되지 않아 배치를 실행할 수 없습니다.',
    };
  }

  const header = request.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!token || !safeEqual(token, secret)) {
    return { ok: false, status: 401, code: 'UNAUTHORIZED', message: '인증되지 않은 요청입니다.' };
  }

  return { ok: true, actor: CRON_ACTOR };
}
