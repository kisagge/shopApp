import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 제한이 붙어야 하는 창구 목록을 여기 박아 둔다.
 *
 * 새 공개 라우트에 제한을 빠뜨리는 것은 **조용히 지나가는 실수**다. 화면도
 * 테스트도 아무 말을 하지 않고, 누가 두드리기 시작해야 알게 된다. 어드민
 * 화면 가드를 목록으로 지키는 것과 같은 이유로 여기에도 목록을 둔다.
 *
 * 목록을 늘리는 것이 규칙이다 — 새 창구를 만들면 여기 한 줄을 더한다.
 */
const GUARDED = [
  'api/events/route.ts',
  'api/cart/quote/route.ts',
  'api/reviews/route.ts',
  'api/coupons/claim/route.ts',
  'api/reviews/[id]/report/route.ts',
  'api/inquiries/route.ts',
  'api/products/recent/route.ts',
  'api/reviews/[id]/helpful/route.ts',
] as const;

const APP = join(process.cwd(), 'src', 'app');
const read = (rel: string) => readFileSync(join(APP, rel), 'utf8');

describe('요청 제한이 붙은 자리', () => {
  it.each(GUARDED)('%s 가 제한을 건다', (rel) => {
    expect(read(rel)).toContain('enforceRateLimit');
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
     * 몸통이 없다고 검사에서 빼면 그쪽만 규칙 밖에 놓인다.
     */
    /*
     * **핸들러를 하나도 빠뜨리지 않는다.** 예전에는 첫 번째만 봤는데,
     * 그러면 POST 에는 제한을 걸고 DELETE 에는 안 건 라우트가 그대로
     * 통과한다. 이 파일에도 PUT 과 DELETE 를 함께 두는 라우트가 생겼다.
     */
    const bodies = read(rel).split(/export async function (?:GET|POST|PUT|PATCH|DELETE)\b/).slice(1);
    expect(bodies.length).toBeGreaterThan(0);

    for (const body of bodies) checkOne(body);
  });

  function checkOne(body: string): void {
    const limit = body.indexOf('await enforceRateLimit');
    expect(limit).toBeGreaterThan(-1);

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
      '.safeParse(',
      'new URL(request.url)',
      'prisma.',
    ];
    for (const needle of work) {
      const at = body.indexOf(needle);
      if (at !== -1) expect(at, needle).toBeGreaterThan(limit);
    }
  }

  it('제한을 건 라우트는 전부 목록에 있다', () => {
    // 반대 방향도 지킨다. 목록에 없는데 붙어 있으면 목록이 낡은 것이다.
    const found: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          walk(full, `${prefix}${name}/`);
        } else if (name === 'route.ts' && readFileSync(full, 'utf8').includes('enforceRateLimit')) {
          found.push(`${prefix}${name}`);
        }
      }
    };
    walk(join(APP, 'api'), 'api/');

    expect(found.sort()).toEqual([...GUARDED].sort());
  });
});

describe('아직 제한이 없는 공개 창구', () => {
  /**
   * 여기 있는 것은 **의도적으로 비워 둔 자리**다.
   *
   * 전부에 제한을 걸면 정상 사용까지 막힌다 — 장바구니 담기는 쇼핑하는
   * 동안 계속 오고, 주소 관리는 사람이 한 번에 몇 번 누른다. 지금은
   * 남용되면 눈에 띄는 창구부터 막았다.
   *
   * 이 목록이 있는 이유는 "빠뜨린 것"과 "안 건 것"을 구분하기 위해서다.
   */
  const INTENTIONAL = [
    'api/cart/route.ts',
    'api/cart/sync/route.ts',
    'api/addresses/route.ts',
    'api/orders/route.ts',
  ];

  it.each(INTENTIONAL)('%s 는 아직 제한이 없다', (rel) => {
    expect(read(rel)).not.toContain('enforceRateLimit');
  });

  it('모두 로그인을 요구한다 — 제한이 없는 대신 익명은 못 두드린다', () => {
    for (const rel of INTENTIONAL) {
      expect(read(rel), rel).toContain('getSessionUser');
    }
  });
});
