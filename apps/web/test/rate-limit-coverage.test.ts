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
  it.each(GUARDED)('%s 는 본문을 읽기 전에 제한을 건다', (rel) => {
    /*
     * 핸들러 본문만 본다. 위에 정의한 헬퍼(예: reviews 의 readBody)에도
     * request.json() 이 나오는데, 그건 정의일 뿐 그때 실행되지 않는다.
     */
    const body = read(rel).split(/export async function (?:POST|PUT|PATCH|DELETE)\b/)[1];
    expect(body).toBeDefined();

    const limit = body!.indexOf('await enforceRateLimit');
    expect(limit).toBeGreaterThan(-1);

    // 본문을 만지는 자리는 어느 것이든 제한보다 뒤에 있어야 한다.
    for (const needle of ['request.json()', 'JSON.parse(raw)', 'readBody(', '.safeParse(']) {
      const at = body!.indexOf(needle);
      if (at !== -1) expect(at).toBeGreaterThan(limit);
    }
  });

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
