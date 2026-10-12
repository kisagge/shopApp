import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 손님 창구가 **세션을 확인하는지** 폴더에서 찾는다.
 *
 * **그물이 운영 쪽에만 있었다.** 요청 제한 훑기는 운영·배치·auth 구역을 통째로 면제하면서
 * "권한 검사가 앞을 막는다" 를 **증명까지** 한다(rate-limit-coverage). 그런데 손님 창구는
 * 그 반대다 — 거기서 면제의 근거로 적은 말이 "(사용자, 상품) 유니크", "자기 주소 하나를
 * 고친다", "자기 문의 하나를 읽거나 지운다" 다. **그 말은 전부 세션이 있을 때만 성립한다.**
 * 세션을 안 읽으면 "자기 것" 이라는 말 자체가 없다.
 *
 * 지금은 서른여섯 창구가 다 제대로 읽고 있다 — 값이 맞아서 조용했을 뿐이고, 새 창구를 만들며
 * 한 줄을 빠뜨리면 아무 검사도 지지 않는다. 그 한 줄이 빠진 창구는 **남의 것을 고치는 창구**가
 * 된다. 그래서 규칙을 뒤집는다: 쓰는 창구는 세션을 읽어야 하고, 안 읽는 것은 이유를 적는다.
 */

const APP = join(process.cwd(), 'src', 'app');
const read = (rel: string) => readFileSync(join(APP, rel), 'utf8');

/**
 * 손님이 부르지 않는 구역.
 *
 * 운영·배치·Better Auth 는 요청 제한 훑기가 이미 "무엇이 앞을 막는지" 를 증명한다 —
 * 같은 것을 두 곳에서 세지 않는다.
 */
const NOT_CUSTOMER = /^api\/(admin|cron|auth)\//;

function customerRoutes(): string[] {
  const found: string[] = [];
  const walk = (dir: string, prefix: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else if (name === 'route.ts' && !NOT_CUSTOMER.test(`${prefix}${name}`)) {
        found.push(`${prefix}${name}`);
      }
    }
  };
  walk(join(APP, 'api'), 'api/');
  return found.sort();
}

/** 무언가를 바꾸는 창구 — 읽기만 하는 곳은 세션이 없어도 할 말이 있다 */
const WRITES = /export async function (POST|PUT|PATCH|DELETE)\b/;

/** 세션을 읽는 길. 어느 것을 쓰든 "이 요청을 보낸 사람" 을 서버가 정한다는 뜻이다 */
const RESOLVES_SESSION = /getActor|getSessionUser|getCurrentUser|getViewer/;

/** 세션이 없으면 거절하는 길 */
const REFUSES = /unauthorized\(\)/;

/**
 * 세션을 **안 읽어도 되는** 창구와 그 이유.
 *
 * 이유 없이 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const NO_SESSION: Readonly<Record<string, string>> = {
  'api/csp-report/route.ts':
    '브라우저가 보낸다. 사람이 아니라 보안 정책 위반이 부르는 자리라 세션이 없다.',
  'api/errors/route.ts':
    '화면이 깨진 뒤에 부른다 — 로그인 전에도 깨지고, 세션을 읽으려다 같이 깨지면 그 고장은 영영 안 남는다.',
  'api/theme/route.ts':
    '쿠키 한 장을 굽고 끝난다. 밝기는 로그인과 무관하고, 비로그인에게도 저장돼야 한다.',
  'api/webhooks/toss/route.ts':
    '결제사가 부른다. 사람의 세션이 아니라 서명이 아무나 못 부르게 막는다.',
};

/**
 * 세션은 읽되 **없다고 거절하지는 않는** 창구와 그 이유.
 *
 * 비로그인에게도 할 말이 있는 자리다. 거절하면 로그인 전에는 가게를 쓸 수 없게 된다.
 */
const SERVES_GUESTS: Readonly<Record<string, string>> = {
  'api/cart/route.ts':
    '비로그인이면 조용히 성공으로 답한다 — 저장할 곳이 없을 뿐 잘못된 요청이 아니고, 화면이 오류를 띄울 일도 아니다.',
  'api/cart/quote/route.ts':
    '장바구니는 로그인 전에도 쓴다. 견적을 막으면 담아 놓고 값을 모르는 상태가 된다.',
  'api/cart/sync/route.ts':
    '브라우저에 담아 둔 것을 로그인 뒤 서버로 옮기는 자리. 옮기는 중에 세션이 없으면 옮길 곳이 없을 뿐이다.',
  'api/events/route.ts':
    '퍼널은 로그인 전부터 시작한다. 비로그인 방문을 버리면 "담기까지 왔다가 떠난 사람" 이 통째로 사라진다.',
  'api/locale/route.ts': '말은 로그인과 무관하다. 평범한 폼 전송이라 429·401 의 JSON 이 사람에게 그대로 보인다.',
  'api/native/session/route.ts':
    '앱이 들고 있던 토큰으로 **세션을 만드는** 자리다 — 들어올 때 세션 쿠키가 없는 것이 정상이다.',
};

const ROUTES = customerRoutes();
const WRITING = ROUTES.filter((rel) => WRITES.test(read(rel)));

describe('손님 쓰기 창구는 세션을 확인한다', () => {
  it('훑을 창구가 실제로 있다', () => {
    // 폴더를 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(ROUTES.length).toBeGreaterThan(30);
    expect(WRITING.length).toBeGreaterThan(20);
  });

  it('면제 목록에 사라진 창구가 없다', () => {
    const names = new Set(ROUTES);
    for (const rel of [...Object.keys(NO_SESSION), ...Object.keys(SERVES_GUESTS)]) {
      expect(names, rel).toContain(rel);
    }
  });

  it.each(WRITING.filter((rel) => !(rel in NO_SESSION)))(
    '%s 는 이 요청을 보낸 사람을 서버가 정한다',
    (rel) => {
      expect(
        RESOLVES_SESSION.test(read(rel)),
        `${rel} — 세션을 안 읽으면 "자기 것만 건드린다" 는 말이 성립하지 않는다`,
      ).toBe(true);
    },
  );

  it.each(WRITING.filter((rel) => !(rel in NO_SESSION) && !(rel in SERVES_GUESTS)))(
    '%s 는 세션이 없으면 거절한다',
    (rel) => {
      expect(
        REFUSES.test(read(rel)),
        `${rel} — 거절하는 길이 없으면 비로그인 요청이 어디까지 가는지 아무도 모른다`,
      ).toBe(true);
    },
  );

  /**
   * **요청 본문의 사용자 id 를 믿지 않는다.**
   *
   * 세션을 읽어 놓고 본문의 `userId` 를 쓰면 읽은 보람이 없다 — 남의 id 를 적어 보내면 그대로
   * 남의 것이 된다. 이벤트 수집 창구가 그 자리를 주석으로 못 박아 두었고, 같은 규칙을 전부에.
   */
  it.each(WRITING)('%s 는 본문의 userId 를 쓰지 않는다', (rel) => {
    const source = read(rel);
    // 주석은 뺀다 — "본문의 userId 는 쓰지 않는다" 고 적어 둔 자리가 있다
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(/\buserId:\s*(?:body|data|parsed|input)\./.test(code), `${rel}`).toBe(false);
  });
});
