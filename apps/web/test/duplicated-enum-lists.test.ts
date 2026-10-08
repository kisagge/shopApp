import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 같은 규칙을 두 곳에 적지 않는다.
 *
 * **이 검사는 같은 실수를 두 번 겪고 만들었다.**
 *
 * 하나는 송장이었다. 어떤 주문에 송장을 붙일 수 있는지를 화면과 서버가 각자
 * 적었고, 화면 쪽 목록이 결제완료와 반품접수를 빠뜨렸다. 취소된 주문에
 * 송장이 붙어 고객 화면에 배송 조회가 떴다.
 *
 * 다른 하나는 리뷰였다. `isReviewableStatus` 가 core 에 **이미 있는데**
 * 리뷰 쓸 것 목록과 마이페이지 배지가 `['DELIVERED', 'CONFIRMED']` 를 손으로
 * 적었다. 값이 같아서 조용했지만, core 를 고치면 쓰기만 바뀌고 보여주는 쪽은
 * 안 바뀐다 — 화면이 권한 것을 누르면 409 가 된다.
 *
 * 둘 다 **값이 어긋나서가 아니라 규칙이 두 곳에 있어서** 생긴다. 그래서
 * 값을 맞추는 대신 **두 곳에 적혔다는 사실**을 잡는다.
 *
 * 열거형처럼 보이는 대문자 목록만 본다 — 같은 문자열 배열이 두 파일 이상에
 * 있으면, 그것은 거의 언제나 한쪽이 다른 쪽을 베낀 것이다.
 *
 * **이 검사는 앱 안의 두 자리가 서로를 베낀 것을 본다**(core 에 그런 목록이 없어도 걸린다).
 * core 에 있는 목록을 베낀 자리는 옆 검사(core-list-copy)가 본다 — 둘은 보는 축이 다르다.
 *
 * **잡는 것은 베낀 순간이지 어긋난 뒤가 아니다.** 이미 갈라진 두 목록은
 * 내용이 달라서 여기 안 걸린다. 그래도 값이 있다 — 어긋남은 언제나 베끼기
 * 에서 시작하고, 그 순간에 걸리면 갈라질 일이 없다. 순서를 바꾸거나 한 줄로
 * 안 쓰면 빠져나가는 것도 사실이다. 완벽한 그물이 아니라, 가장 흔한 길목이다.
 */

const SRC = join(process.cwd(), 'src');

/** 대문자 상수 두 개 이상으로 이뤄진 배열 리터럴 */
const ENUM_LIST = /\[\s*((?:'[A-Z][A-Z_]{2,}'\s*,\s*)+'[A-Z][A-Z_]{2,}'\s*)\]/g;

function walk(dir: string, hit: (rel: string, text: string) => void, base = SRC): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, hit, base);
    else if (/\.tsx?$/.test(name)) hit(full.slice(base.length + 1), readFileSync(full, 'utf8'));
  }
}

/**
 * 두 곳에 적혀도 되는 목록과 그 이유.
 *
 * **이유 없이 이름만 적는 것은 검사를 끄는 것과 같다.** 왜 나눠 적어도
 * 되는지가 남아야 다음 사람이 판단할 수 있다.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

describe('같은 열거형 목록이 두 곳에 적혀 있지 않다', () => {
  const places = new Map<string, Set<string>>();
  walk(SRC, (rel, text) => {
    for (const m of text.matchAll(ENUM_LIST)) {
      const key = [...(m[1] ?? '').matchAll(/'([A-Z][A-Z_]{2,})'/g)]
        .map((x) => x[1])
        .sort()
        .join('·');
      if (!places.has(key)) places.set(key, new Set());
      places.get(key)!.add(rel);
    }
  });

  it('그물이 실제로 뜬다 — 본보기 하나를 넣어 본다', () => {
    /*
     * **상한 없는 검사는 눈을 감고 통과한다.** 정규식이 헛돌면 아무것도 안 걸리고, 그러면 무엇을
     * 넣어도 지나간다.
     *
     * 처음에는 "저장소에 열거형 배열이 둘 이상 남아 있는가" 로 그것을 확인했다. 그런데 그 수는
     * **일을 잘할수록 줄어드는 수**다 — 목록을 core 로 옮길 때마다 내려가고, 실제로 남은 종류가
     * 하나가 되자 멀쩡한 변경이 이 줄에서 졌다. 고쳐야 할 것은 저장소가 아니라 확인하는 방법이었다.
     *
     * 그물 자체를 시험한다: 아는 글자를 넣어 걸리는지 본다. 저장소에 몇 개가 남았는지와 무관하다.
     */
    const sample = "const carriers = ['CJ_LOGISTICS', 'LOTTE_GLOBAL'];";
    const found = [...sample.matchAll(ENUM_LIST)].map((m) =>
      [...(m[1] ?? '').matchAll(/'([A-Z][A-Z_]{2,})'/g)].map((x) => x[1]).sort().join('·'));

    expect(found, '정규식이 헛돌고 있다 — 이 검사는 아무것도 막지 못한다').toEqual([
      'CJ_LOGISTICS·LOTTE_GLOBAL',
    ]);
  });

  it('두 파일 이상에 같은 목록이 적힌 곳이 없다', () => {
    const dup = [...places.entries()]
      .filter(([key, files]) => files.size > 1 && !(key in EXEMPT))
      .map(([key, files]) => `${key} → ${[...files].sort().join(', ')}`);

    expect(
      dup,
      '같은 규칙이 두 곳에 있다. core 로 옮기고 양쪽이 그것을 쓰게 한다',
    ).toEqual([]);
  });

  it('면제에 적힌 목록이 실제로 두 곳에 있다', () => {
    // 자리가 사라졌는데 면제만 남으면 조용히 아무것도 안 막는다
    const stale = Object.keys(EXEMPT).filter((k) => (places.get(k)?.size ?? 0) < 2);
    expect(stale).toEqual([]);
  });
});
