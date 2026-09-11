import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 목록이 비었을 때 화면이 말을 하는가.
 *
 * **표 머리만 남으면 고장인지 원래 그런 건지 알 수 없다.** 저장소를 처음
 * 띄우면 가맹점도 쿠폰도 하나 없는 것이 정상인데, 그 두 화면이 아무 말도
 * 하지 않고 표 머리만 그리고 있었다.
 *
 * 관례는 이미 있었다 — 주문·정산 목록은 비면 표를 문구로 대체한다. 손님
 * 화면도 마이페이지 여덟 곳이 전부 그렇게 한다. **관례가 있는데 두 곳만
 * 빠져 있었다.** 그런 것은 사람이 눈으로 세어 찾을 일이 아니다.
 *
 * 그래서 목록을 적지 않고 **표를 그리는 파일을 전부 찾아** 본다. 새 표가
 * 생기면 저절로 걸린다.
 */

const ADMIN = join(process.cwd(), 'src', 'app', 'admin');

function walk(dir: string, out: string[] = [], base = ADMIN): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out, base);
    else if (name.endsWith('.tsx')) out.push(full.slice(base.length + 1));
  }
  return out;
}

/**
 * **주석을 걷어내고 본다.**
 *
 * 처음에는 파일에 "아직" 이나 "없습니다" 가 있는지만 봤는데, 가맹점 화면은
 * 그 말이 **주석 안에** 있어서 빈 상태가 있는 것처럼 보였다. 실제로는 표
 * 머리만 그리고 있었다. 사람에게 보이는 글자만 세야 한다.
 */
const stripComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** 줄을 반복해 그리는 표를 가진 파일 */
const tables = walk(ADMIN).filter((rel) => {
  const text = readFileSync(join(ADMIN, rel), 'utf8');
  if (!text.includes('<tbody>')) return false;
  return /\w+\.map\(/.test(text.slice(text.indexOf('<tbody>')));
});

/**
 * 빌 일이 없는 표와 그 이유.
 *
 * **이유 없이 이름만 적는 것은 검사를 끄는 것과 같다.**
 */
const EXEMPT: Readonly<Record<string, string>> = {
  'products/stock-form.tsx':
    '상품의 옵션 표다. 상품에는 옵션이 최소 하나 있으므로 빌 일이 없다 — 옵션이 없는 상품은 애초에 만들어지지 않는다.',
  'orders/[orderNo]/page.tsx':
    '주문에 담긴 상품 표다. 줄이 하나도 없는 주문은 만들어지지 않는다(주문 생성이 빈 줄을 거절한다).',
};

describe('어드민 표는 비었을 때 이유를 말한다', () => {
  it('훑을 표가 실제로 있다', () => {
    // 정규식이 헛돌면 아무것도 안 걸리고, 그런 검사는 무엇을 넣어도 통과한다
    expect(tables.length).toBeGreaterThan(3);
  });

  /**
   * **신호를 둘 다 본다. 어느 하나로는 모자랐다.**
   *
   * 처음에는 `length === 0` 같은 모양만 찾았는데, 트래픽 표는
   * `months.every(...)` 로 판단하고 있어서 제대로 다루는데도 걸렸다.
   *
   * 그래서 사람에게 보이는 말("없습니다")로 바꿨더니 이번에는 포인트 대사
   * 표가 걸렸다 — 거기 문구는 **"모든 회원의 잔액이 원장과 일치합니다"** 다.
   * 대사 표에서 비었다는 것은 나쁜 소식이 아니라 좋은 소식이라, 그 말이 맞다.
   *
   * 판단하는 방법도 쓰는 말도 화면마다 다를 수 있다. 잡으려는 것은 **아무것도
   * 안 하는 화면**이므로, 둘 중 하나라도 있으면 통과시킨다.
   */
  it.each(tables)('%s 가 빈 경우를 다룬다', (rel) => {
    if (rel in EXEMPT) return;
    const text = stripComments(readFileSync(join(ADMIN, rel), 'utf8'));
    const branches = /length === 0|length > 0 \?|\.every\(|colSpan/.test(text);
    const speaks = /없습니다|없어요|일치합니다/.test(text);
    expect(
      branches || speaks,
      `${rel} 는 목록이 비면 표 머리만 남고 아무 말도 하지 않는다`,
    ).toBe(true);
  });

  it('면제에 적힌 표가 실제로 있다', () => {
    // 파일이 사라졌는데 면제만 남으면 조용히 아무것도 안 막는다
    expect(Object.keys(EXEMPT).filter((k) => !tables.includes(k))).toEqual([]);
  });
});
