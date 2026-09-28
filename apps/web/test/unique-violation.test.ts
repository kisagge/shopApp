import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { isUniqueViolation } from '~/lib/db/unique-violation';

/**
 * 유니크 제약 위반을 알아보는 한 자리.
 *
 * **같은 판정이 여섯 가지 모양으로 흩어져 있었다** — `instanceof
 * Prisma.PrismaClientKnownRequestError` 로 보는 곳 다섯, `'code' in error` 로 보는 곳 둘,
 * 오리 타입으로 보는 곳 넷. 그리고 "어느 칸이 부딪혔나" 를 함께 보는 여덟 줄이 세 곳에
 * 복사돼 있었다(주문번호·멱등 열쇠·적립 조정 열쇠). 셋 다 같은 함정 주석을 달고 있었다.
 */

const P2002 = (target?: unknown) =>
  Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
    ...(target === undefined ? {} : { meta: { target } }),
  });

describe('무엇을 유니크 위반으로 보는가', () => {
  it('코드가 P2002 면 위반이다', () => {
    expect(isUniqueViolation(P2002())).toBe(true);
  });

  it('다른 코드는 아니다 — P2003 은 외래키다', () => {
    expect(isUniqueViolation(Object.assign(new Error('x'), { code: 'P2003' }))).toBe(false);
  });

  it('평범한 오류도, 오류가 아닌 것도 아니다', () => {
    expect(isUniqueViolation(new Error('DB 가 안 열린다'))).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation('P2002')).toBe(false);
  });

  /**
   * **검사에서 흉내 낸 Prisma 는 평범한 객체를 던진다.** 그래서 `instanceof` 로 보면
   * 운영에서는 잡히는데 검사에서는 안 잡히는 판정이 된다 — 멱등 검사들이 애초에 오리
   * 타입으로 적혀 있던 이유다. 모양으로 보면 양쪽에서 같은 답이 나온다.
   */
  it('클래스가 아니라 모양으로 본다', () => {
    expect(isUniqueViolation({ code: 'P2002' })).toBe(true);
  });
});

describe('어느 칸이 부딪혔는가', () => {
  it('배열로 온 칸 이름을 찾는다', () => {
    expect(isUniqueViolation(P2002(['userId', 'orderNo']), 'orderNo')).toBe(true);
    expect(isUniqueViolation(P2002(['userId']), 'orderNo')).toBe(false);
  });

  it('문자열로 와도 찾는다 — Prisma 가 둘 다 준다', () => {
    expect(isUniqueViolation(P2002('orders_orderNo_key'), 'orderNo')).toBe(true);
  });

  /**
   * **배열에 String() 을 씌우면 "[object Object]" 가 된다.**
   *
   * 그러면 어떤 이름과도 맞지 않아 재시도가 **조용히** 실패한다 — 주문번호가 부딪혔는데
   * 다시 뽑지 않고 그대로 터진다. 세 곳이 같은 주석을 달고 있던 그 함정이다.
   */
  it('배열을 글자로 바꿔 보는 실수를 하지 않는다', () => {
    expect(isUniqueViolation(P2002([{ toString: () => 'orderNo' }]), 'orderNo')).toBe(false);
    expect(isUniqueViolation(P2002(['orderNo']), 'orderNo')).toBe(true);
  });

  it('부딪힌 칸을 모르면(meta 가 없으면) 그 칸이라고 하지 않는다', () => {
    expect(isUniqueViolation(P2002(), 'orderNo')).toBe(false);
    // 칸을 묻지 않았으면 여전히 위반이다
    expect(isUniqueViolation(P2002())).toBe(true);
  });
});

/**
 * 판정을 손으로 다시 적은 곳이 없는지 본다. 여섯 모양이 흩어져 있던 것이 이 검사가
 * 생긴 이유이므로, 한 곳으로 모은 뒤에 다시 흩어지는 것을 막는다.
 */
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('판정하는 자리', () => {
  it('P2002 를 아는 곳은 이 한 파일뿐이다', () => {
    const offenders = walk(SRC)
      .map((path) => ({ rel: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }))
      .filter((f) => f.rel !== join('lib', 'db', 'unique-violation.ts'))
      .filter((f) => f.source.includes('P2002'))
      .map((f) => f.rel);

    expect(
      offenders,
      `유니크 위반 판정을 손으로 적었다:\n${offenders.join('\n')}\n` +
        'lib/db/unique-violation 의 isUniqueViolation(error, 칸이름) 을 쓰면 된다.',
    ).toEqual([]);
  });
});
