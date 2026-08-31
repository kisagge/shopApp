import { isServerOnlyEvent } from '@shop/core';
import { eventBatchSchema, type EventBatchResponse } from '@shop/contract';
import { NextResponse } from 'next/server';
import {
  deviceTypeOf, hashIp, recordEvents, toTrackedEvent, type CollectionContext,
} from '~/lib/analytics/server';

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
    return NextResponse.json(
      { code: 'PAYLOAD_TOO_LARGE', message: '요청이 너무 큽니다.' },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json(
      { code: 'INVALID_JSON', message: '요청 본문을 읽을 수 없습니다.' },
      { status: 400 },
    );
  }

  const parsed = eventBatchSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      fields[issue.path.join('.') || '_'] = issue.message;
    }
    return NextResponse.json(
      { code: 'VALIDATION_FAILED', message: '이벤트 형식을 확인해 주세요.', fields },
      { status: 400 },
    );
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
    // 인증이 붙으면 세션에서 읽는다. 요청 본문의 userId 는 절대 쓰지 않는다.
    userId: null,
    ipHash: hashIp(clientIp(request)),
    deviceType: deviceTypeOf(request.headers.get('user-agent')),
  };

  try {
    await recordEvents(parsed.data.events.map((e) => toTrackedEvent(e, ctx)));
  } catch (error) {
    // fanOut 이 이미 삼키지만 어댑터 밖의 실패까지 막는다.
    console.error('[analytics] 이벤트 적재 실패', error);
    const failed: EventBatchResponse = { accepted: 0, rejected: parsed.data.events.length };
    return NextResponse.json(failed, { status: 202 });
  }

  const response: EventBatchResponse = { accepted: parsed.data.events.length, rejected: 0 };
  return NextResponse.json(response, { status: 202 });
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return request.headers.get('x-real-ip');
}
