import { describe, it, expect, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const proxy = (await import('~/proxy')).default;
const { config } = await import('~/proxy');

/**
 * 요청마다 값이 달라지는 보안 헤더 — CSP.
 *
 * **문장 열셋이 전부 안 돌았다.** e2e(`security-headers`)가 진짜 브라우저에서
 * 보는 것은 따로다: nonce 가 `script-src` 에 있고 요청마다 다르다는 것,
 * `strict-dynamic`·`frame-ancestors 'none'`·`base-uri 'none'`, 그리고 그 CSP
 * 아래에서 화면이 살아 있다는 것. 여기서는 **거기서 볼 수 없는 것**을 본다.
 *
 * 가장 중요한 것이 **개발과 배포의 차이**다. e2e 는 한 환경에서만 도므로 둘을
 * 견줄 수 없는데, 그 차이를 잘못 적으면 한쪽은 개발 서버의 HMR 이 죽고 다른
 * 쪽은 배포에 `unsafe-eval` 이 실려 나간다 — CSP 를 둔 뜻이 거기서 사라진다.
 */

const cspOf = (request = new NextRequest('https://plain.test/')): string =>
  proxy(request).headers.get('content-security-policy') ?? '';

/** 지시문 하나를 꺼낸다 — 세미콜론으로 나뉘어 있다 */
const directive = (csp: string, name: string): string | undefined =>
  csp.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `));

const inDev = (): string => {
  vi.stubEnv('NODE_ENV', 'development');
  return cspOf();
};
const inProduction = (): string => {
  vi.stubEnv('NODE_ENV', 'production');
  return cspOf();
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('개발과 배포가 다른 자리', () => {
  it('개발 서버에만 eval 을 열어 준다 — HMR 이 그것을 쓴다', () => {
    expect(directive(inDev(), 'script-src')).toContain("'unsafe-eval'");
  });

  it('배포에는 eval 을 열지 않는다 — 열면 CSP 를 둔 뜻이 사라진다', () => {
    expect(directive(inProduction(), 'script-src')).not.toContain("'unsafe-eval'");
  });

  it('배포에서만 http 를 https 로 올린다', () => {
    expect(directive(inProduction(), 'upgrade-insecure-requests')).toBeDefined();
  });

  it('개발 서버에는 그 지시를 넣지 않는다 — http 로 도는 자기 자신을 못 부르게 된다', () => {
    expect(directive(inDev(), 'upgrade-insecure-requests')).toBeUndefined();
  });

  it('그 둘 말고는 같은 CSP 다 — 환경마다 다른 규칙이 늘어나면 한쪽만 검사된다', () => {
    const dev = inDev().split(';').map((d) => d.trim());
    vi.unstubAllEnvs();
    const prod = inProduction().split(';').map((d) => d.trim());

    const onlyDev = dev.filter((d) => !prod.includes(d)).map((d) => d.replace(/'nonce-[^']+'/, 'N'));
    const onlyProd = prod.filter((d) => !dev.includes(d)).map((d) => d.replace(/'nonce-[^']+'/, 'N'));

    expect(onlyDev).toEqual([
      "script-src N 'strict-dynamic' 'unsafe-eval' 'unsafe-inline' https:",
    ]);
    expect(onlyProd).toEqual([
      "script-src N 'strict-dynamic' 'unsafe-inline' https:",
      'upgrade-insecure-requests',
    ]);
  });
});

describe('닫아 두는 것들', () => {
  it.each([
    ['default-src', "default-src 'self'"],
    ['object-src', "object-src 'none'"],
  ])('%s 는 %s 다', (name, expected) => {
    expect(directive(cspOf(), name)).toBe(expected);
  });

  it('폼은 우리 서버와 결제창으로만 간다 — 남의 서버로 전송되지 않게', () => {
    expect(directive(cspOf(), 'form-action')).toBe("form-action 'self' https://*.tosspayments.com");
  });

  it('사진은 우리 저장소와 data·blob 뿐이다 — 아무 데서나 받지 않는다', () => {
    const sources = directive(cspOf(), 'img-src')!.split(' ').slice(1);

    expect(sources).toContain("'self'");
    expect(sources).toContain('data:');
    expect(sources).toContain('blob:');
    // 맨 `https:` 는 사실상 전부 허용이다 — 저장소 주소 하나만 적는다
    expect(sources).not.toContain('https:');
    expect(sources.filter((s) => s.startsWith('https://'))).toHaveLength(1);
  });
});

describe('남의 SDK 가 여는 창', () => {
  it('결제창은 연결과 프레임 둘 다 열어 준다', () => {
    const csp = cspOf();

    expect(directive(csp, 'connect-src')).toContain('https://*.tosspayments.com');
    expect(directive(csp, 'frame-src')).toContain('https://*.tosspayments.com');
  });

  it('우편번호는 다음이 아니라 카카오 주소를 띄운다 — 읽어서가 아니라 돌려 봐서 아는 자리다', () => {
    /*
     * 스크립트는 `t1.daumcdn.net` 에서 오는데 실제로 여는 창은
     * `postcode.map.kakao.com` 이다. 코드만 보고 daum 쪽만 적었다가 막혔다.
     */
    const frame = directive(cspOf(), 'frame-src')!;

    expect(frame).toContain('https://*.kakao.com');
    expect(frame).toContain('https://*.daumcdn.net');
  });
});

describe('막힌 것을 조용하지 않게', () => {
  it('막히면 우리 창구로 알린다 — 아무도 오류라고 말해 주지 않는 자리다', () => {
    expect(directive(cspOf(), 'report-uri')).toBe('report-uri /api/csp-report');
  });
});

describe('nonce 를 싣는 두 자리', () => {
  it('응답에만 넣지 않고 요청 헤더로도 보낸다 — 응답만이면 화면이 통째로 죽는다', () => {
    /*
     * Next 는 **들어온 요청의 CSP** 에서 nonce 를 읽어 자기가 만드는
     * `<script>` 에 붙인다. 응답에만 넣으면 우리 페이지의 부트스트랩
     * 스크립트가 스스로의 CSP 에 막힌다.
     */
    const response = proxy(new NextRequest('https://plain.test/'));
    const sent = response.headers.get('x-middleware-request-content-security-policy');

    expect(sent).toBe(response.headers.get('content-security-policy'));
    expect(response.headers.get('x-middleware-override-headers'))
      .toContain('content-security-policy');
  });

  it('nonce 는 base64 로 싣는다 — CSP 문법이 깨지지 않게', () => {
    const nonce = /'nonce-([^']+)'/.exec(cspOf())![1]!;

    expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(nonce)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('CSP 를 붙이지 않는 주소', () => {
  /*
   * `_next` 아래는 통째로 뺀다. 스크립트·스타일 파일 자체에는 CSP 가 뜻이 없고,
   * **개발 서버의 HMR 소켓이 여기를 지나간다** — 붙여 두었더니 연결이 끊겼다.
   */
  /* Next 는 이 꼴을 **주소 전체**에 맞춘다 — 앵커 없이 재면 어디서나 걸려 늘 통과한다 */
  const matcher = new RegExp(`^${config.matcher[0]!}$`);

  it.each([
    ['/_next/static/chunk.js', '빌드 산출물'],
    ['/_next/webpack-hmr', 'HMR 소켓'],
    ['/favicon.ico', '파비콘'],
    ['/sw.js', '서비스 워커'],
    ['/manifest.webmanifest', '앱 선언'],
    ['/robots.txt', '로봇 규칙'],
    ['/sitemap.xml', '사이트맵'],
  ])('%s — %s 는 지나지 않는다', (path) => {
    expect(matcher.test(path)).toBe(false);
  });

  it.each(['/', '/cart', '/product/wool-coat', '/admin/orders', '/api/orders'])(
    '%s 는 지난다',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );
});
