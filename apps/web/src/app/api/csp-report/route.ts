import { NextResponse } from 'next/server';
import { enforceRateLimit } from '~/lib/rate-limit';

/**
 * CSP 위반 신고를 받는 자리.
 *
 * **막힌 것을 조용하지 않게 하려고 둔다.** CSP 는 틀렸을 때 아무 말도 하지
 * 않는다 — 화면의 어떤 조각이 그냥 안 뜨고, 사용자는 "안 돼요" 라고만 말할
 * 수 있다. 실제로 우편번호 찾기가 그랬다: 코드에는 daum 이라고 적혀 있는데
 * 실제로 여는 창은 kakao 라 막혔고, **돌려 보지 않았으면 몰랐다.**
 *
 * 결제 SDK 는 실키가 없어 아직 그렇게 돌려 보지 못했다. 그래서 이 창구가
 * 있다 — 배포에서 막히는 것이 있으면 로그로 드러난다.
 *
 * 신고 본문은 브라우저가 보내는 값이지만 **바깥에서 아무나 보낼 수도 있다.**
 * 그래서 저장하지 않고 로그로만 남기고, 길이를 잘라 둔다.
 */

/** 로그 한 줄이 지나치게 길어지지 않게 */
const MAX_FIELD = 300;

const clip = (value: unknown): string =>
  typeof value === 'string' ? value.slice(0, MAX_FIELD) : '';

export async function POST(request: Request): Promise<NextResponse> {
  // 제한을 일을 시작하기 전에 건다
  const limited = await enforceRateLimit('cspReport', request, null);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    // 형식이 이상해도 브라우저에게 돌려줄 말은 없다
    return new NextResponse(null, { status: 204 });
  }

  const report = (body as { 'csp-report'?: Record<string, unknown> })?.['csp-report'] ?? {};

  console.warn('[csp] 막힘', {
    directive: clip(report['violated-directive'] ?? report['effective-directive']),
    blocked: clip(report['blocked-uri']),
    document: clip(report['document-uri']),
  });

  // 브라우저는 답을 기다리지 않는다. 본문을 만들 이유가 없다.
  return new NextResponse(null, { status: 204 });
}
