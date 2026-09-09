import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * **운영진이 바꾼 것은 남는다.**
 *
 * 권한을 넷으로 나눠 놓고 누가 무엇을 했는지 남기지 않으면 절반만 한 것이다.
 * 환불·권한 부여·정산 지급 같은 동작은 되돌릴 수 없고 돈이 걸려 있는데,
 * 기록이 없으면 나중에 물어볼 수 있는 것이 "지금 값이 무엇인가" 뿐이다.
 *
 * 지금은 빠짐없이 남고 있다. **그걸 지키는 것이 없어서** 이 검사를 둔다 —
 * 새 운영 창구를 만들면서 한 줄을 빠뜨리면 아무것도 터지지 않고 그 동작만
 * 조용히 장부에서 사라진다.
 *
 * 목록을 손으로 들지 않고 **파일 시스템에서 만든다.** 요청 제한·접근성 훑기·
 * 배치 등록을 지키는 것과 같은 자리다.
 */

const ROOT = resolve(import.meta.dirname, '..');
const API = join(ROOT, 'src/app/api');

/** 상태를 바꾸는 메서드 */
const WRITE = /export async function (POST|PUT|PATCH|DELETE)\b/;

/**
 * 감사 로그를 남기지 않아도 되는 창구와 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Record<string, string>> = {};

function routes(dir: string, prefix = ''): readonly string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return routes(full, `${prefix}/${name}`);
    return name === 'route.ts' ? [prefix] : [];
  });
}

/**
 * 이 라우트가 감사 로그에 닿는가.
 *
 * 라우트 자신과 **직접 부르는 `~/lib` 모듈**까지 본다. 운영 화면 대부분은
 * 라우트에서 바로 남기지만, 고객센터 글은 `manage-support` 안에서 남긴다 —
 * 쓰기가 세 갈래인데 라우트는 둘뿐이라 그쪽이 자연스러운 자리였다.
 */
function recordsAudit(routePath: string): boolean {
  const file = join(API, routePath, 'route.ts');
  const source = readFileSync(file, 'utf8');
  if (source.includes('recordAudit')) return true;

  for (const match of source.matchAll(/from '~\/(lib\/[a-zA-Z0-9/-]+)'/g)) {
    const target = join(ROOT, 'src', `${match[1]!}.ts`);
    if (existsSync(target) && readFileSync(target, 'utf8').includes('recordAudit')) return true;
  }
  return false;
}

/** 운영진이 부르는 창구 중 상태를 바꾸는 것 */
const adminWrites = routes(join(API, 'admin'), '/admin').filter((r) =>
  WRITE.test(readFileSync(join(API, r, 'route.ts'), 'utf8')),
);

/**
 * 배치는 메서드가 GET 이지만 **상태를 바꾼다.**
 *
 * 스케줄러가 부르는 자리라 GET 인데, 하는 일은 구매확정·포인트 만료·정산
 * 마감이다. 메서드만 보면 통째로 빠지므로 따로 넣는다.
 */
const cronWrites = routes(join(API, 'cron'), '/cron');

describe('감사 로그', () => {
  it('운영·배치 창구를 실제로 찾는다 — 빈 목록이면 아래가 전부 통과한다', () => {
    expect(adminWrites.length).toBeGreaterThan(15);
    expect(cronWrites.length).toBeGreaterThan(3);
  });

  it.each([...adminWrites, ...cronWrites])('%s 가 누가 했는지 남긴다', (route) => {
    if (route in EXEMPT) return;

    expect(
      recordsAudit(route),
      `${route} 가 상태를 바꾸는데 감사 로그를 남기지 않는다.\n` +
        'recordAudit 을 라우트나 그 라우트가 부르는 lib 에 붙이거나,\n' +
        '남길 필요가 없다면 EXEMPT 에 이유와 함께 적는다.',
    ).toBe(true);
  });

  it('면제 목록에 이유 없이 적힌 것이 없다', () => {
    expect(Object.entries(EXEMPT).filter(([, why]) => why.trim().length < 20)).toEqual([]);
  });

  it('면제된 창구가 전부 실제로 있다 — 목록만 남고 창구가 사라지면 안 된다', () => {
    const known = new Set([...adminWrites, ...cronWrites]);
    expect(Object.keys(EXEMPT).filter((r) => !known.has(r))).toEqual([]);
  });
});
