import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 응답 문구가 화면의 말로 나가는지 지킨다.
 *
 * 401·403·본문 파싱 실패를 **여든아홉 곳에서 손으로 쓰고 있었고**, 그 문구가
 * 전부 한국어로 박혀 있었다 — 일본어로 요청해도 "로그인이 필요합니다." 가
 * 나갔다. 화면들은 그 message 를 그대로 보여 준다.
 *
 * 되돌아오기 쉽다. 새 라우트를 만들 때 옆 파일을 복사하는 것이 가장 손쉬운
 * 길이고, **눈으로는 아무 차이도 안 보인다** — 한국어로 보면 멀쩡하다.
 */

const API = join(process.cwd(), 'src', 'app', 'api');

/** 라우트가 직접 쓰면 안 되는 문구. 공통 응답이 세 언어로 만들어 준다. */
const HARDCODED = [
  '로그인이 필요합니다',
  '권한이 없습니다',
  '요청 본문을 읽을 수 없습니다',
  '업로드 형식을 읽을 수 없습니다',
  '요청이 너무 큽니다',
];

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (name === 'route.ts') out.push(full);
  }
  return out;
}

const files = routes(API);

describe('라우트 오류 응답', () => {
  it('라우트를 하나 이상 찾았다 — 못 찾으면 아래 검사가 헛돈다', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(HARDCODED)('%s 를 손으로 쓴 라우트가 없다', (phrase) => {
    const offenders = files
      .filter((f) => readFileSync(f, 'utf8').includes(phrase))
      .map((f) => f.replace(API, 'api'));

    expect(offenders, '~/lib/api/respond 의 공통 응답을 쓰세요').toEqual([]);
  });

  it('공통 응답을 실제로 쓴다', () => {
    const users = files.filter((f) => readFileSync(f, 'utf8').includes("~/lib/api/respond"));
    expect(users.length).toBeGreaterThan(30);
  });
});

/**
 * 본문을 읽는 자리도 한 곳이다.
 *
 * **같은 열 줄이 마흔여덟 곳에 있었다** — 본문을 못 읽으면 400, 계약에 안 맞으면 어느 칸이 틀렸는지와
 * 함께 400. 창구마다 다를 이유가 없는데 창구마다 적혀 있었고, 그래서 본문 크기 상한 같은 것을 걸 자리가
 * 마흔여덟 곳이었다. `readBody(request, schema)` 가 그 열 줄을 대신한다.
 *
 * **조용히 버려야 하는 창구는 뺀다.** 오류 수집·CSP 신고·결제 웹훅은 형식이 이상해도 브라우저나
 * 결제사에게 돌려줄 말이 없어 204·200 으로 끝낸다 — 400 을 돌려주는 것과 다른 이야기다.
 */
describe('본문 읽기', () => {
  /** 이름과 이유를 함께 적는다 — 다음 사람이 여기에 한 줄 더 적기 전에 그 이유를 보게 */
  const QUIET: Readonly<Record<string, string>> = {
    'api/errors/route.ts': '브라우저가 보낸 오류다 — 형식이 이상하면 조용히 버린다(204)',
    'api/csp-report/route.ts': '브라우저의 신고다 — 돌려줄 말이 없다(204)',
    'api/webhooks/toss/route.ts': '결제사에게는 받았다고만 답한다 — 재시도를 부르지 않는다(200)',
  };

  it('본문 읽기를 손으로 적은 라우트가 없다', () => {
    const offenders = files
      .filter((f) => readFileSync(f, 'utf8').includes('body = await request.json();'))
      .map((f) => f.replace(API, 'api'))
      .filter((name) => !(name in QUIET));

    expect(offenders, '~/lib/api/read-body 의 readBody 를 쓰세요').toEqual([]);
  });

  it('조용히 버리는 창구는 실제로 그 셋뿐이다 — 목록이 낡으면 예외가 예외가 아니게 된다', () => {
    const quiet = Object.keys(QUIET).filter((name) =>
      files.some((f) => f.replace(API, 'api') === name),
    );

    expect(quiet.sort()).toEqual(Object.keys(QUIET).sort());
  });
});
