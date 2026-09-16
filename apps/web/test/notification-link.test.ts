import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * 알림에 갈 곳을 붙이는 칸 이름을 지킨다.
 *
 * **쿠폰 알림만 갈 곳 없이 쌓이고 있었다.** 칸 이름은 `linkPath` 인데 `href` 라고
 * 적혀 있었고, 타입 검사도 린트도 통과했다. 개발 DB 에서 다른 알림은 전부
 * 링크가 있는데 `COUPON_ISSUED` 만 0건이었다 — 받은 사람은 쿠폰 알림을 눌러도
 * 아무 데도 갈 수 없었다.
 *
 * **왜 안 걸렸나.** 초과 속성 검사는 **갓 만든 객체 리터럴**에만 걸린다.
 * `deliverNotice({ ... })` 처럼 곧바로 넘기는 자리는 걸리지만,
 * `list.map((x) => ({ ... }))` 는 map 이 돌려주는 타입을 스스로 지어내므로
 * 그 배열을 `NoticeInput[]` 로 넘기는 것은 그냥 부분형 검사가 된다.
 * `href` 는 남는 칸이라 무시되고, `linkPath` 는 선택이라 없어도 된다.
 *
 * 그래서 두 가지를 지킨다: map 은 돌려주는 타입을 적고, 알림을 적는 파일에는
 * `href` 라는 말을 쓰지 않는다(이 저장소에서 그 말은 링크 컴포넌트의 것이다).
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return name.endsWith('.ts') ? [full] : [];
  });
}

/** 알림을 적는 파일들 — 기록 함수를 들여온 곳 */
function recordingFiles(): { file: string; source: string }[] {
  return walk(SRC)
    .map((file) => ({ file, source: readFileSync(file, 'utf8') }))
    .filter(
      ({ file, source }) =>
        !file.endsWith(join('notifications', 'record.ts')) &&
        /from '(~\/lib\/notifications\/record|\.\/record)'/.test(source),
    );
}

describe('알림의 갈 곳', () => {
  it('찾는 것이 있다 — 못 찾으면 아래가 전부 통과한다', () => {
    /*
     * 두 검사 모두 "어긋난 것이 없다" 를 말하는데, 훑어서 아무것도 못 찾아도
     * 어긋난 것은 없다. 표 여백 검사에서 같은 함정을 겪었다.
     */
    expect(recordingFiles().length, '알림을 적는 파일을 하나도 못 찾았다').toBeGreaterThan(2);
  });

  it('알림을 적는 자리에 href 라고 쓰지 않는다 — 칸 이름은 linkPath 다', () => {
    const offenders = recordingFiles()
      .filter(({ source }) => /\bhref\s*:/.test(source))
      .map(({ file }) => relative(SRC, file));

    expect(offenders, 'href 는 링크 컴포넌트의 말이다. 알림의 칸은 linkPath 다').toEqual([]);
  });

  it('map 으로 여러 건을 적을 때는 돌려주는 타입을 적는다', () => {
    /*
     * 이것이 없으면 오타 난 칸이 조용히 통과한다. 타입을 적어 두면 그
     * 자리가 갓 만든 리터럴이 되어 초과 속성 검사가 다시 걸린다.
     */
    const offenders: string[] = [];

    for (const { file, source } of recordingFiles()) {
      for (const call of source.matchAll(/recordNotifications\(([\s\S]{0,400}?)\)\s*;/g)) {
        const body = call[1] ?? '';
        if (!body.includes('.map(')) continue;
        // `(n): NoticeInput =>` 처럼 돌려주는 타입이 적혀 있어야 한다
        if (!/\)\s*:\s*NoticeInput\s*=>/.test(body)) {
          offenders.push(relative(SRC, file));
        }
      }
    }

    expect([...new Set(offenders)]).toEqual([]);
  });
});
