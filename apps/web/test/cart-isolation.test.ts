import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 장바구니를 쥐는 명세는 저마다 자기 손님을 써야 한다.
 *
 * **왜 이 검사가 생겼는가.** 서버 장바구니는 계정에 하나뿐이고, 저장은
 * 통째로 바꾸는 방식이다 — 마지막에 보낸 목록이 곧 결과다. 그런데 장바구니를
 * 쓰는 명세들은 하나같이 "먼저 비우고 담는" 것으로 시작한다. 넷이 한 계정을
 * 나눠 쓰면서 fullyParallel 로 도니, 한쪽이 비우는 순간 다른 쪽 장바구니가
 * 사라졌다.
 *
 * 실패 흔적이 그대로 남아 있다. 담기 저장은 200 으로 성공했는데 그 100ms
 * 뒤부터 2초 동안 읽기가 계속 빈 목록이었다 — 같은 쿠키, 같은 계정이다.
 * 같은 시각 어드민 검사들은 2초 안에 통과하고 있었으니 서버가 느린 것도
 * 아니었다.
 *
 * **목록을 손으로 적지 않는다.** e2e 폴더를 읽어 장바구니를 건드리는 파일을
 * 직접 찾아, 저마다 다른 계정을 선언했는지 본다. 다섯 번째 명세가 생겨도
 * 여기서 걸린다.
 */
const E2E = join(process.cwd(), 'e2e');

/** 서버 장바구니를 비우거나 채우는 명세인가 */
function ownsCart(source: string): boolean {
  return source.includes('addFirstProductToCart') || /request\.put\(\s*'\/api\/cart'/.test(source);
}

/** test.use 로 선언한 세션 파일 이름 */
function declaredState(source: string): string | null {
  return /test\.use\(\{\s*storageState:\s*STATE_FILE\.(\w+)/.exec(source)?.[1] ?? null;
}

const specs = readdirSync(E2E)
  .filter((name) => name.endsWith('.spec.ts'))
  .map((name) => ({ name, source: readFileSync(join(E2E, name), 'utf8') }));

const owners = specs.filter((s) => ownsCart(s.source));

describe('장바구니를 쥐는 명세', () => {
  it('실제로 찾아낸다 — 못 찾으면 이 검사는 아무것도 지키지 못한다', () => {
    expect(specs.length).toBeGreaterThan(10);
    expect(owners.length).toBeGreaterThan(0);
  });

  it.each(owners.map((o) => o.name))('%s 가 자기 계정을 선언한다', (name) => {
    const spec = owners.find((o) => o.name === name)!;
    expect(
      declaredState(spec.source),
      `${name} 은 서버 장바구니를 비우고 채운다. test.use({ storageState: STATE_FILE.… }) 로 자기 손님을 지정해야 한다.`,
    ).not.toBeNull();
  });

  it('둘이 같은 계정을 쓰지 않는다', () => {
    const used = owners.map((o) => `${o.name} → ${declaredState(o.source)}`);
    const keys = owners.map((o) => declaredState(o.source));
    expect(new Set(keys).size, `계정을 나눠 쓰고 있다:\n${used.join('\n')}`).toBe(keys.length);
  });

  it('파일 안에서도 한 번에 하나씩 돈다', () => {
    // fullyParallel 이라 같은 파일의 검사들도 동시에 돈다 — 그것들끼리도 부딪힌다
    for (const spec of owners) {
      expect(spec.source, `${spec.name} 에 serial 선언이 없다`).toContain(
        "test.describe.configure({ mode: 'serial' })",
      );
    }
  });
});
