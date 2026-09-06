import { isServerOnlyEvent, requiresConsent } from '@shop/core';
import { enforceRateLimit } from '~/lib/rate-limit';
import { getSessionUser } from '@shop/auth/session';
import { prisma } from '@shop/db';
import { eventBatchSchema, type EventBatchResponse } from '@shop/contract';
import { NextResponse } from 'next/server';
import {
  deviceTypeOf, hashIp, recordEvents, toTrackedEvent, type CollectionContext,
} from '~/lib/analytics/server';
import { validationFailed } from '~/lib/i18n/validation';
import { invalidJson, tooLarge } from '~/lib/api/respond';

/** 본문 크기 상한. 배치 20건이면 넉넉하다. */
const MAX_BODY_BYTES = 64 * 1024;

/**
 * 이벤트 수집.
 *
 * 여기서 지키는 것 세 가지.
 * 1) purchase·refund 는 거부한다. 매출 이벤트를 브라우저가 보내게 두면
 *    누구나 curl 로 매출을 지어낼 수 있다.
 * 2) userId·시각·IP 는 요청 본문이 아니라 서버가 정한다.
 * 3) 실패해도 조용히 끝낸다. 분석 때문에 사용자 화면이 깨지면 안 된다.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const raw = await request.text();

  if (raw.length > MAX_BODY_BYTES) {
    return await tooLarge();
  }

  // 요청 본문의 userId 는 절대 쓰지 않는다. 세션이 말하는 사람만 믿는다.
  const sessionUser = await getSessionUser(request.headers);

  /**
   * 제한을 **본문을 읽기 전에** 건다.
   *
   * 검증 뒤에 두면 형식이 틀린 요청은 400 으로 먼저 빠져나가서 세어지지도
   * 않는다 — 아무 쓰레기나 보내면 제한을 통째로 우회하면서 파싱 비용은
   * 그대로 우리가 낸다. 실제로 그렇게 만들어 놓고 130번 두드려 보고 알았다.
   *
   * 누구인지는 사용자 id 로, 없으면 해시한 IP 로 센다 — 같은 사무실에서
   * 여러 사람이 쓰면 IP 가 같아서, IP 로만 세면 한 사람이 남의 몫까지 쓴다.
   */
  const limited = await enforceRateLimit('events', request, sessionUser?.id ?? null);
  if (limited) return limited;

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return await invalidJson();
  }

  const parsed = eventBatchSchema.safeParse(body);
  if (!parsed.success) {
    return validationFailed(parsed.error);
  }

  // 매출 이벤트는 서버만 기록한다. 한 건이라도 섞여 있으면 배치 전체를 거절한다 —
  // 나머지를 조용히 받으면 클라이언트가 잘못 만들어진 걸 눈치채지 못한다.
  const forged = parsed.data.events.filter((e) => isServerOnlyEvent(e.name));
  if (forged.length > 0) {
    return NextResponse.json(
      {
        code: 'SERVER_ONLY_EVENT',
        message: `${forged.map((e) => e.name).join(', ')} 는 서버에서만 기록합니다.`,
      },
      { status: 400 },
    );
  }


  const ctx: CollectionContext = {
    userId: sessionUser?.id ?? null,
    ipHash: hashIp(clientIp(request)),
    deviceType: deviceTypeOf(request.headers.get('user-agent')),
  };

  // 브라우저 트래커도 동의를 확인하지만 서버에서 한 번 더 막는다.
  // 클라이언트 게이트만 믿으면 트래커를 우회한 요청이 그대로 들어온다.
  //
  // **명시적으로 거부한 경우에만** 버린다. null(미결정)은 익명 사용자와 같게
  // 취급한다 — 그러지 않으면 로그인하는 순간 추적이 줄어든다.
  //
  // 동의는 세션이 아니라 DB 에서 읽는다. 세션 캐시가 5분이라 방금 바꾼 설정이
  // 반영되지 않고, 동의 철회는 즉시 듣는 게 맞다. 필수 이벤트만 들어온
  // 배치에서는 조회 자체를 건너뛴다.
  const needsConsent = parsed.data.events.some((e) => requiresConsent(e.name));
  const declined =
    sessionUser !== null &&
    needsConsent &&
    (
      await prisma.user.findUnique({
        where: { id: sessionUser.id },
        select: { analyticsConsent: true },
      })
    )?.analyticsConsent === 'DENIED';

  const allowed = declined
    ? parsed.data.events.filter((e) => !requiresConsent(e.name))
    : parsed.data.events;

  if (allowed.length === 0) {
    const none: EventBatchResponse = { accepted: 0, rejected: parsed.data.events.length };
    return NextResponse.json(none, { status: 202 });
  }

  try {
    await recordEvents(allowed.map((e) => toTrackedEvent(e, ctx)));
  } catch (error) {
    // fanOut 이 이미 삼키지만 어댑터 밖의 실패까지 막는다.
    console.error('[analytics] 이벤트 적재 실패', error);
    const failed: EventBatchResponse = { accepted: 0, rejected: parsed.data.events.length };
    return NextResponse.json(failed, { status: 202 });
  }

  const response: EventBatchResponse = {
    accepted: allowed.length,
    rejected: parsed.data.events.length - allowed.length,
  };
  return NextResponse.json(response, { status: 202 });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}
