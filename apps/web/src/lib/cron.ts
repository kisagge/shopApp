import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import type { Actor } from '@shop/core';
import { recordAudit, type AuditTargetType } from './audit';

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

/** 배치가 감사 로그에 남길 한 줄. 무엇을 언제 남길지는 배치가 정한다. */
export interface CronAudit {
  readonly action: string;
  readonly targetType: AuditTargetType;
  readonly targetId: string;
  /** 남길 내용. 감사 로그가 지울 키(비밀번호·계좌 따위)는 recordAudit 이 지운다 */
  readonly after: unknown;
}

/** 배치가 내놓는 것 — 응답에 실을 몸통과, 남길 것이 있으면 그 목록 */
export interface CronOutcome {
  readonly body: unknown;
  /**
   * 남길 줄. **0건인 날은 빈 목록을 준다** — 아무 일도 없던 날까지 남기면
   * 정작 봐야 할 줄이 잡음에 묻힌다. 그 기준은 배치마다 다르므로 배치가 정한다.
   */
  readonly audits?: readonly CronAudit[];
}

/** 상태와 코드를 스스로 아는 오류인가 — 배치가 던지는 도메인 오류의 모양이다 */
function knownFailure(error: unknown): { status: number; code: string; message: string } | null {
  if (typeof error !== 'object' || error === null) return null;
  const e = error as { status?: unknown; code?: unknown; message?: unknown };
  return typeof e.status === 'number' && typeof e.code === 'string' && typeof e.message === 'string'
    ? { status: e.status, code: e.code, message: e.message }
    : null;
}

/**
 * 배치 라우트의 뼈대.
 *
 * **일곱 개가 같은 네 줄로 시작하고 있었다** — 문지기를 부르고, 막히면 코드와
 * 메시지를 그대로 실어 돌려보낸다. 감사 로그를 거는 모양도, "0건인 날은 남기지
 * 않는다" 는 주석도 일곱 번 각자 적혀 있었다. 문지기를 한 곳에서만 부르면
 * 그 검사를 빠뜨린 여덟 번째 배치가 생길 수 없다.
 *
 * 배치가 할 일만 `run` 에 남는다 — 무엇을 부르고, 무엇을 응답에 싣고, 무엇을 남기는가.
 *
 * **넘어지면 로그에 남긴다.** 배치는 보는 사람이 없어서, 조용히 500 이 나면
 * 아무도 모른 채 며칠이 지난다. 상태를 스스로 아는 오류는 그대로 돌려보내고
 * 나머지는 다시 던진다 — 모르는 고장을 200 으로 덮지 않는다.
 */
export function cronRoute(
  name: string,
  run: (actor: Actor) => Promise<CronOutcome>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request): Promise<NextResponse> => {
    const auth = authorizeCron(request);
    if (!auth.ok) {
      return NextResponse.json({ code: auth.code, message: auth.message }, { status: auth.status });
    }

    let outcome: CronOutcome;
    try {
      outcome = await run(auth.actor);
    } catch (error) {
      const known = knownFailure(error);
      if (!known) throw error;
      console.error(`[cron] ${name} 실패`, { code: known.code, message: known.message });
      return NextResponse.json({ code: known.code, message: known.message }, { status: known.status });
    }

    for (const entry of outcome.audits ?? []) {
      await recordAudit({ ...entry, actor: auth.actor, request });
    }

    return NextResponse.json(outcome.body);
  };
}
