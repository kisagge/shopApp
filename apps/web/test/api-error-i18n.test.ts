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
