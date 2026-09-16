import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { PERMISSION } from '@shop/core';

/**
 * **선언한 권한은 어딘가에서 검사된다.**
 *
 * authz 의 첫 줄은 "한쪽에만 규칙이 있으면 메뉴는 안 보이는데 URL 로 직접 치면
 * 되는 구멍이 생긴다" 고 적어 두었는데, `review:write` 는 **양쪽 다 없었다** —
 * 34개 중 유일하게 강제 지점이 0인 권한이었다. 고객과 운영진에게만 주고
 * 가맹점에게는 주지 않았으니 규칙은 분명했지만, 아무도 읽지 않으니 없는 규칙이다.
 * 가맹점이 자기 상품을 사서 자기가 별 다섯을 쓸 수 있었다.
 *
 * 이런 것은 화면이 멀쩡히 동작해서 **아무도 모른다.** 권한을 하나 더하는 가장
 * 흔한 방법은 목록에 한 줄 적는 것이고, 가장 흔한 실수는 거기서 끝내는 것이다.
 *
 * **한계를 적어 둔다.** 이 검사는 "그 권한을 보는 자리가 **있는가**" 를 본다.
 * 어느 창구에 빠졌는지는 못 잡는다 — 그건 감사 로그 검사(audit-coverage)와 같은
 * 한계다. 잡으려는 것은 **선언만 하고 한 번도 연결하지 않은 경우**다.
 */

const ROOT = join(process.cwd(), '..', '..');
/** 권한을 선언하는 곳. 여기 적혀 있는 것은 검사가 아니다 */
const AUTHZ = join(ROOT, 'packages/core/src/authz.ts');

/** 권한을 실제로 보는 말 */
const GATE = /hasPermission|assertPermission|requireAdmin|ForbiddenError|:\s*Permission\b/;

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []);
}

/** 권한 → 그 권한을 보는 파일들 */
function enforcementSites(): Map<string, string[]> {
  const files = [
    ...walk(join(ROOT, 'apps/web/src')),
    ...walk(join(ROOT, 'packages/core/src')),
  ].filter((f) => f !== AUTHZ);

  const found = new Map<string, string[]>();
  for (const file of files) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!GATE.test(line)) continue;
      for (const match of line.matchAll(/'([a-z]+:[A-Za-z]+)'/g)) {
        const name = match[1]!;
        found.set(name, [...(found.get(name) ?? []), relative(ROOT, file)]);
      }
    }
  }
  return found;
}

describe('권한은 선언만으로 끝나지 않는다', () => {
  const sites = enforcementSites();

  it('찾는 것이 있다 — 못 찾으면 아래가 전부 통과한다', () => {
    // 표 여백 검사와 감사 로그 검사에서 같은 함정을 겪었다
    expect(sites.size, '권한을 보는 자리를 하나도 못 찾았다').toBeGreaterThan(20);
  });

  it('모든 권한에 강제 지점이 있다', () => {
    const orphans = PERMISSION.filter((p) => !sites.has(p));
    expect(orphans, '목록에만 있고 아무도 읽지 않는 권한이다').toEqual([]);
  });

  it('찾은 이름이 모두 실제 권한이다 — 오타는 조용히 통과한다', () => {
    /*
     * `hasPermission(actor, 'review:wirte')` 는 타입이 잡지만, 감사 로그 사유나
     * 메시지에 적힌 문자열은 안 잡힌다. 여기서 보이면 둘 중 하나가 낡은 것이다.
     */
    const unknown = [...sites.keys()].filter((k) => !(PERMISSION as readonly string[]).includes(k));
    expect(unknown).toEqual([]);
  });
});
