import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { messageKeys } from '@shop/i18n/all';

/**
 * **부르는 곳이 없는 사전 열쇠를 남기지 않는다.**
 *
 * 짝이 되는 검사가 둘 있다 — 계약의 제약에 문구가 붙었는지, 그 문구가 사전에
 * 있는지. 반대 방향은 아무도 안 봤다. 화면을 고치면서 쓰지 않게 된 문구가
 * 사전에 그대로 남고, 세 언어에 한 줄씩 쌓이고, 다음 사람은 그것이 아직 쓰이는
 * 줄 알고 번역을 맞춘다. 실제로 서른한 개가 그렇게 남아 있었다.
 *
 * `dead-exports` 와 같은 결이다 — 지우거나, 부를 자리를 만든다.
 *
 * ── 세는 방법 ──────────────────────────────────────────────────
 * 열쇠를 **따옴표째** 찾는다. 그냥 문자열로 찾으면 `product.soldOut` 같은
 * 이름이 변수의 속성 접근(`product.soldOut`)에 걸리고, `catalog.reset` 은
 * 살아 있는 `catalog.resetFilters` 안에 들어 있어 둘 다 쓰이는 것으로 보인다.
 * 처음에 그렇게 세었다가 멀쩡한 열쇠를 지울 뻔했다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/** 열쇠를 부를 수 있는 곳 전부. 사전 파일 자신은 뺀다 — 거기엔 늘 있다. */
const ROOTS = [
  'apps/web/src', 'apps/web/test', 'apps/web/e2e',
  'packages/ui/src', 'packages/auth/src', 'packages/contract/src',
  'packages/core/src', 'packages/db/src', 'packages/mail/src',
  'packages/i18n/src', 'packages/i18n/test',
];

const SKIP = new Set(['node_modules', '.next', 'generated', 'messages']);

function sources(dir: string): readonly string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP.has(name) ? [] : sources(full);
    return /\.tsx?$/.test(name) ? [readFileSync(full, 'utf8')] : [];
  });
}

const source = ROOTS.flatMap((r) => sources(join(ROOT, r))).join('\n');

/**
 * 열쇠를 이름으로 조립해 쓰는 자리.
 *
 * `keysOf(ORDER_STATUS, 'orderStatus')` 처럼 값 목록에서 만들거나,
 * `` `category.${slug}` `` 처럼 붙여 쓴다. 그런 그룹은 낱낱이 부르지 않으므로
 * 접두사째로 살아 있는 것으로 본다.
 */
const alivePrefixes = [
  ...[...source.matchAll(/keysOf\(\s*[A-Z_]+\s*,\s*'([a-zA-Z]+)'\s*,?\s*\)/g)].map((m) => `${m[1]!}.`),
  ...[...source.matchAll(/`([a-zA-Z]+(?:\.[a-zA-Z]+)*)\.\$\{/g)].map((m) => `${m[1]!}.`),
];

/** 쓰지 않지만 남겨 두는 열쇠와 그 이유. 이름만 적는 것은 목록으로 돌아가는 것이다. */
const EXEMPT: Readonly<Record<string, string>> = {};

const used = (key: string): boolean =>
  source.includes(`'${key}'`) || source.includes(`"${key}"`) || source.includes(`\`${key}\``);

describe('사전 열쇠', () => {
  const keys = messageKeys();

  it('훑을 것이 있다 — 비면 아래가 헛돈다', () => {
    expect(keys.length).toBeGreaterThan(500);
    expect(source.length).toBeGreaterThan(500_000);
    expect(alivePrefixes.length).toBeGreaterThan(5);
  });

  it('부르는 곳이 없는 열쇠가 없다', () => {
    const dead = keys.filter(
      (key) => !used(key) && !alivePrefixes.some((p) => key.startsWith(p)) && !(key in EXEMPT),
    );

    expect(
      dead,
      '이 열쇠들은 어디서도 부르지 않는다. 세 언어에 한 줄씩 남아 있고,\n' +
        '다음 사람은 아직 쓰이는 줄 알고 번역을 맞춘다.\n' +
        '지우거나, 부를 자리를 만들거나, 이름으로 조립해 쓴다면 EXEMPT 에 이유와 함께 적는다.',
    ).toEqual([]);
  });

  it('면제 목록에 이유 없이 적힌 것이 없다', () => {
    expect(Object.entries(EXEMPT).filter(([, why]) => why.trim().length < 20)).toEqual([]);
  });

  it('면제된 열쇠가 전부 사전에 있다', () => {
    const known = new Set<string>(keys);
    expect(Object.keys(EXEMPT).filter((k) => !known.has(k))).toEqual([]);
  });
});
