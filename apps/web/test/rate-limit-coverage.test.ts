import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 제한이 필요한 창구를 **폴더에서 찾는다.**
 *
 * 예전에는 목록을 손으로 들고 있었고, 주석에 "새 창구를 만들면 여기 한 줄을
 * 더한다" 고 적혀 있었다 — 기억에 기대는 규칙이다. 그래서 목록 밖에 열여덟
 * 개가 아무도 안 본 채로 있었고, 그중 **주문 생성**이 있었다. 주문을 만드는
 * 것은 곧 재고를 깎는 것이라 한 계정이 반복해 부르면 매대가 빈다.
 *
 * 같은 실수를 접근성 훑기와 번들 상한에서도 했다. 셋 다 손 목록이었다.
 * 그래서 규칙을 뒤집는다 — **모든 라우트가 제한을 걸어야 하고, 안 거는
 * 것은 아래에 이유를 적어야 한다.** 새 창구는 자동으로 검사에 걸린다.
 */

/**
 * 제한을 걸지 않는 창구와 그 이유.
 *
 * 이유 없이 이름만 적는 것은 목록으로 되돌아가는 것과 같다. 왜 안 거는지가
 * 남아 있어야 나중에 그 판단이 아직 맞는지 볼 수 있다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'api/health/route.ts':
    'DB 를 치지 않는 상태 확인 창구다. 여기를 조이면 감시 도구가 먼저 막힌다.',
  'api/locale/route.ts':
    '평범한 폼 전송이라 429 를 주면 사람이 JSON 을 보게 된다. 로그인했으면 자기 행의 locale 한 칸을 갱신하는데, 세션이 있어야 하고 자기 행뿐이라 남에게 번지지 않는다.',
  'api/theme/route.ts':
    '쿠키 하나를 굽고 끝난다 — DB 도 저장소도 안 건드린다. 언어와 같은 폼 전송이라 429 의 JSON 이 사람에게 그대로 보인다.',
  'api/webhooks/toss/route.ts':
    '결제사가 부른다. 사람이 아니라 재시도 정책이 호출 빈도를 정하고, 조이면 입금 통지를 놓친다. 서명 검증이 아무나 못 부르게 막는다.',
  'api/cart/route.ts':
    '한 사용자에 장바구니 하나다. (사용자, 변형) 유니크가 있어 몇 번을 불러도 줄이 늘지 않고, 담을 수 있는 줄 수도 MAX_CART_LINES 로 묶여 있다.',
  'api/cart/sync/route.ts': '같은 장바구니를 덮어쓴다 — 반복해도 줄이 늘지 않는다.',
  'api/wishlist/[productId]/route.ts':
    '(사용자, 상품) 유니크. 반복 호출이 줄을 늘리지 못한다.',
  'api/restock/[variantId]/route.ts':
    '(사용자, 변형) 유니크. 반복 호출이 줄을 늘리지 못한다.',
  'api/notifications/read/route.ts':
    '이미 있는 줄의 읽음 표시를 바꾼다. 새로 만드는 것이 없다.',
  'api/addresses/[id]/route.ts':
    '자기 주소 하나를 고치거나(PUT) 기본으로 삼거나(PATCH) 지운다. 줄이 늘지 않고, 만드는 창구(POST /addresses)에 제한이 있다.',
  'api/account/close/route.ts':
    '확인 문구를 정확히 받아야 하고, 한 번 닫히면 두 번째 호출은 상태 검사에서 걸린다.',
  'api/reviews/[id]/route.ts':
    '자기 리뷰 하나를 고치거나 지운다. 새로 쓰는 창구(POST /reviews)에 제한이 있다.',
  'api/inquiries/[id]/route.ts': '자기 문의 하나를 읽거나 지운다.',
  'api/inquiries/[id]/answer/route.ts':
    '가맹점·운영진만 부른다. 권한 검사가 앞에 있고, 답변은 문의 하나에 하나다.',
  'api/merchant/apply/route.ts':
    '심사 중인 신청이 있으면 ALREADY_APPLIED 로 막힌다 — 한 사람이 여러 건을 쌓을 수 없다.',
  'api/orders/[orderNo]/cancel/route.ts':
    '주문 하나의 상태를 옮긴다. 이미 취소된 주문은 상태 검사에서 걸린다.',
  'api/orders/[orderNo]/cancel-items/route.ts':
    '줄 하나는 한 번만 취소된다(이미 취소된 줄은 거절). 미리보기는 자기 주문 하나를 읽을 뿐이다.',
  'api/orders/[orderNo]/confirm/route.ts': '같은 이유 — 상태 기계가 반복을 막는다.',
  'api/orders/[orderNo]/return/route.ts': '같은 이유 — 상태 기계가 반복을 막는다.',
};

const APP = join(process.cwd(), 'src', 'app');
const read = (rel: string) => readFileSync(join(APP, rel), 'utf8');

/** api 아래 route.ts 를 전부 찾는다 */
function allRoutes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else if (name === 'route.ts') found.push(`${prefix}${name}`);
    }
  };
  walk(join(APP, 'api'), 'api/');
  return found.sort();
}

/**
 * 통째로 면제하되 **그 근거를 검사로 확인하는** 구역.
 *
 * 어드민 스물여섯 개를 이름으로 적으면 목록이 다시 손 목록이 된다. 대신
 * 면제의 근거를 그대로 검사로 만든다 — "권한 검사가 앞을 막는다" 가 이유라면
 * 정말로 막는지 확인해야 면제가 성립한다. 권한 검사를 빠뜨린 어드민 라우트는
 * 제한이 없는 것보다 훨씬 나쁘고, 이 검사가 그것도 함께 잡는다.
 */
const EXEMPT_ZONE: readonly { prefix: string; reason: string; proof: RegExp }[] = [
  {
    prefix: 'api/admin/',
    reason: '운영진·가맹점만 부른다. 권한 검사가 앞을 막는다.',
    proof: /getActor|hasPermission/,
  },
  {
    prefix: 'api/cron/',
    reason: '배치 전용. CRON_SECRET 없이는 401 이다.',
    proof: /authorizeCron/,
  },
  {
    prefix: 'api/auth/',
    reason: 'Better Auth 가 자체 제한을 건다.',
    proof: /auth\.handler|toNextJsHandler/,
  },
];

const inZone = (rel: string) => EXEMPT_ZONE.find((z) => rel.startsWith(z.prefix));

const ROUTES = allRoutes();
const GUARDED = ROUTES.filter((r) => !(r in EXEMPT) && !inZone(r));

describe('요청 제한이 붙은 자리', () => {
  it('훑을 라우트가 실제로 있다', () => {
    // 폴더를 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(ROUTES.length).toBeGreaterThan(50);
    expect(GUARDED.length).toBeGreaterThan(5);
  });

  it.each(ROUTES.filter(inZone))('%s 는 면제 근거가 실제로 있다', (rel) => {
    const zone = inZone(rel);
    expect(zone).toBeDefined();
    expect(
      read(rel),
      `${rel} 는 "${zone?.reason}" 로 제한을 면제받는데, 그 근거가 코드에 없다.`,
    ).toMatch(zone!.proof);
  });

  it('면제 목록에 사라진 라우트가 없다', () => {
    // 라우트를 지웠는데 면제만 남으면, 왜 면제했는지 읽을 대상이 없어진다
    const stale = Object.keys(EXEMPT).filter((r) => !ROUTES.includes(r));
    expect(stale, `면제 목록이 낡았다:\n${stale.join('\n')}`).toEqual([]);
  });

  it.each(GUARDED)('%s 가 제한을 건다', (rel) => {
    expect(
      read(rel),
      `${rel} 에 제한이 없다. enforceRateLimit 을 걸거나, 안 거는 이유를 EXEMPT 에 적는다.`,
    ).toContain('enforceRateLimit');
  });

  /**
   * **제한이 본문을 읽기 전에 있어야 한다.**
   *
   * 처음 붙일 때 검증 뒤에 두었더니 형식이 틀린 요청은 400 으로 먼저
   * 빠져나가서 세어지지도 않았다 — 130번 두드려 400 만 130개 받고 429 는
   * 하나도 없었다. 아무 쓰레기나 보내면 제한을 통째로 우회하면서 파싱
   * 비용은 그대로 우리가 내는 상태였다.
   *
   * 눈으로 보고 넘어갈 수 있는 실수라 자리를 검사로 박아 둔다.
   */
  it.each(GUARDED)('%s 는 일을 시작하기 전에 제한을 건다', (rel) => {
    /*
     * 핸들러 본문만 본다. 위에 정의한 헬퍼(예: reviews 의 readBody)에도
     * request.json() 이 나오는데, 그건 정의일 뿐 그때 실행되지 않는다.
     *
     * GET 도 함께 본다. 읽기 창구에는 본문이 없지만 규칙은 같다 —
     * **막을 요청이 일을 다 하고 나서 429 를 받으면 막은 것이 아니다.**
     *
     * **핸들러를 하나도 빠뜨리지 않는다.** 예전에는 첫 번째만 봤는데,
     * 그러면 POST 에는 제한을 걸고 DELETE 에는 안 건 라우트가 그대로
     * 통과한다.
     */
    const bodies = read(rel).split(/export async function (?:GET|POST|PUT|PATCH|DELETE)\b/).slice(1);
    expect(bodies.length).toBeGreaterThan(0);

    for (const body of bodies) checkOne(body, rel);
  });

  function checkOne(body: string, rel: string): void {
    const limit = body.indexOf('await enforceRateLimit');
    expect(limit, rel).toBeGreaterThan(-1);

    /*
     * 요청을 뜯거나 DB 를 부르는 자리는 어느 것이든 제한보다 뒤에 있어야 한다.
     *
     * 세션 읽기는 예외다 — 제한 자체가 "누구의 요청인가" 를 알아야 하므로
     * 반드시 앞에 온다. 같은 사무실에서 여러 사람이 쓰면 IP 가 같아서,
     * 로그인한 사람은 IP 가 아니라 자기 id 로 세어야 한다.
     */
    const work = [
      'request.json()',
      'JSON.parse(raw)',
      'readBody(',
      // 리뷰·문의가 함께 쓰는 본문 읽기(사진 multipart 포함)
      'readJsonWithImages(',
      '.safeParse(',
      'new URL(request.url)',
      'prisma.',
    ];
    for (const needle of work) {
      const at = body.indexOf(needle);
      if (at !== -1) expect(at, `${rel} — ${needle}`).toBeGreaterThan(limit);
    }
  }
});

describe('주문 생성은 재고를 깎는다', () => {
  /**
   * 이 검사가 따로 있는 이유.
   *
   * 예전 판에는 주문 생성이 **제한을 걸지 않는 자리로 명시돼 있었다** —
   * "남용되면 눈에 띄는 창구부터 막았다" 는 판단이었다. 그 판단은 주문
   * 생성이 곧 재고 차감이라는 것을 빠뜨렸다. 초과 판매는 조건부 갱신이
   * 막지만, **결제 없이 버려진 주문이 재고를 물고 있는 것**은 막지 않는다.
   *
   * 같은 판단이 다시 나오지 않게 이유를 검사로 남긴다.
   */
  it('주문 라우트는 제한을 건다', () => {
    expect(read('api/orders/route.ts')).toContain("enforceRateLimit('order'");
  });

  it('주문 제한은 사용자 단위다', () => {
    // IP 로 세면 같은 사무실 사람들이 한 사람으로 묶인다
    expect(read('api/orders/route.ts')).toContain("'order', request, sessionUser.id");
  });
});
