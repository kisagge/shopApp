import { NextResponse, type NextRequest } from 'next/server';

/**
 * 보안 헤더 중 **요청마다 값이 달라지는 것**을 붙인다.
 *
 * 나머지 헤더는 next.config 의 headers() 가 붙인다. CSP 만 여기 있는 이유는
 * 요청마다 새 nonce 가 필요하기 때문이다.
 *
 * ── 왜 nonce 인가
 *
 * `script-src 'self' 'unsafe-inline'` 로 적어 둔 CSP 는 **있으나 마나 하다.**
 * XSS 로 심어진 인라인 스크립트가 정확히 그 규칙을 통과한다. 값을 가지려면
 * 우리가 만든 스크립트만 통과시켜야 하고, 그게 nonce 다.
 *
 * `'strict-dynamic'` 을 함께 쓴다. 우편번호 찾기(다음)와 결제(토스) SDK 는
 * **자기 스크립트를 스스로 더 심는다.** 호스트 목록으로 막으면 그 안쪽까지
 * 다 적어야 하는데, 남의 SDK 내부를 우리가 추측해 적는 것은 틀리기 마련이다.
 * strict-dynamic 은 "nonce 를 받은 스크립트가 만든 스크립트는 믿는다" 이므로
 * 우리 코드가 부른 것만 이어서 허용된다.
 *
 * `'unsafe-inline'` 과 `https:` 를 뒤에 남기는 것은 **옛 브라우저용 사다리**다.
 * nonce 와 strict-dynamic 을 아는 브라우저는 이 둘을 무시한다.
 */

/**
 * CSP 가 필요 없는 것들.
 *
 * `_next` 아래는 통째로 뺀다. 스크립트·스타일 파일 자체에는 CSP 가 의미가
 * 없고, **개발 서버의 HMR 소켓이 여기를 지나간다** — 붙여 두었더니 연결이
 * 끊겨 콘솔이 오류로 가득 찼다.
 */
export const config = {
  matcher: [
    '/((?!_next/|favicon.ico|icon.svg|apple-icon.png|pwa-icon|sw.js|manifest.webmanifest|robots.txt|sitemap.xml).*)',
  ],
};

const IMAGE_HOST = 'https://pub-c08272fd498f4808b376f4e97004f2c5.r2.dev';

/**
 * 결제창과 우편번호 찾기가 여는 창.
 *
 * 이 둘은 iframe 을 띄우고 자기 서버와 이야기한다 — 우리 코드가 부르는
 * 것이라 여기 적는 것이 추측이 아니다.
 */
const PAYMENT = 'https://*.tosspayments.com';
/*
 * **다음 우편번호인데 카카오 주소를 띄운다.** 스크립트는
 * t1.daumcdn.net 에서 오는데 실제로 여는 창은 postcode.map.kakao.com 이다.
 * 코드만 보고 daum 쪽만 적었다가 검사에서 막혔다 — 남의 SDK 가 어디를
 * 부르는지는 **읽어서가 아니라 돌려 봐서** 알아야 한다.
 */
const POSTCODE = 'https://*.daum.net https://*.daumcdn.net https://*.kakao.com';

function buildCsp(nonce: string, dev: boolean): string {
  return [
    "default-src 'self'",
    // 주소창을 base 로 바꿔치기하는 공격을 막는다
    "base-uri 'none'",
    "object-src 'none'",
    // 우리 화면을 남의 페이지에 끼워 클릭을 훔치는 것을 막는다
    "frame-ancestors 'none'",
    // 폼이 남의 서버로 전송되지 않게. 결제창은 예외로 둔다.
    `form-action 'self' ${PAYMENT}`,
    [
      'script-src',
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      // 개발 서버는 HMR 이 eval 을 쓴다. 배포에는 넣지 않는다.
      dev ? "'unsafe-eval'" : '',
      "'unsafe-inline'",
      'https:',
    ]
      .filter(Boolean)
      .join(' '),
    /*
     * 스타일에는 nonce 를 못 준다. Next 와 Tailwind 가 인라인 <style> 을
     * 넣고 그 자리에 nonce 를 꽂을 방법이 없다. 스타일 주입은 스크립트
     * 주입보다 위험이 훨씬 낮아 여기서 멈춘다.
     */
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${IMAGE_HOST}`,
    "font-src 'self' data:",
    `connect-src 'self' ${PAYMENT}`,
    `frame-src 'self' ${PAYMENT} ${POSTCODE}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    // 배포는 https 뿐이다. 개발 서버(http)에 넣으면 자기 자신을 못 부른다.
    dev ? '' : 'upgrade-insecure-requests',
    /*
     * **막힌 것을 조용하지 않게 한다.** CSP 가 틀리면 화면의 어떤 조각이
     * 그냥 안 뜨고 아무도 오류라고 말해 주지 않는다. report-uri 는 폐기
     * 예정이지만 모든 브라우저가 아직 알아듣는다 — 새 report-to 는 별도
     * 헤더와 그룹 설정이 필요해서, 여기서는 확실히 도착하는 쪽을 쓴다.
     */
    'report-uri /api/csp-report',
  ]
    .filter(Boolean)
    .join('; ');
}

export default function proxy(request: NextRequest): NextResponse {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== 'production';
  const csp = buildCsp(nonce, dev);

  /*
   * **요청 헤더에도 실어 보낸다.** Next 는 들어온 요청의 CSP 에서 nonce 를
   * 읽어 자기가 만드는 <script> 에 붙인다. 응답에만 넣으면 우리 페이지의
   * 부트스트랩 스크립트가 스스로의 CSP 에 막혀 화면이 통째로 죽는다.
   */
  const headers = new Headers(request.headers);
  headers.set('content-security-policy', csp);

  const response = NextResponse.next({ request: { headers } });
  response.headers.set('content-security-policy', csp);
  return response;
}
