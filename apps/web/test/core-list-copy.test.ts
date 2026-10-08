import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

/**
 * **core 의 목록을 손으로 베낀 자리를 찾는다.**
 *
 * 하루에 같은 고장을 넷 만났다. 전화번호 검색(주문번호 조각으로 읽어 0건), 찜 목록과 장바구니(검수
 * 대기를 빼먹어 404 와 "팔림"), 반품 대기열(철회가 어느 탭에도 안 뜸). 넷 다 모양이 같았다 —
 * **한 곳에 모아 둔 목록을 다른 자리가 손으로 베꼈고, 베낄 때 한 칸이 빠졌다.** 그리고 넷 다 오류
 * 없이 조용히 틀렸다.
 *
 * 베낀 자리는 베낀 순간에는 맞다. 틀리는 것은 **원본이 늘어날 때**이고, 그때 아무도 베낀 쪽을 찾아
 * 가지 않는다. 그래서 사람이 기억하는 대신 여기서 찾는다.
 *
 * **통째로 베낀 것만 센다.** 부분집합은 대개 뜻이 있는 추림이고(출고 전 상태, 끝나지 않은 신청),
 * 그 추림에는 이름과 까닭이 붙는다. 반면 **원본과 똑같은 목록**을 다시 적은 것은 추림이 아니라 사본이다.
 * 그 상수 이름을 파일이 한 번이라도 부르면 넘어간다 — 알고 쓰는 자리다.
 *
 * **배열만 보면 절반만 본다.** 사본은 `||` 사슬로도 적힌다(`status === 'A' || status === 'B'`). 다만 그쪽은
 * 그냥 두 값을 묻는 평범한 가지도 많아서, 조건을 더 좁힌다 — **core 가 이미 이름을 붙여 둔 묶음**(다른
 * 목록의 진부분집합인 것: 출고 전 줄, 끝나지 않은 신청, 돈이 되돌아간 상태…)과 **똑같은 값들**을 조건식으로
 * 다시 적은 자리만 센다. 그 묶음에는 이미 이름과 까닭이 있으므로, 다시 적는 것은 그 까닭을 버리는 일이다.
 *
 * **이 검사가 못 잡는 것도 적어 둔다.** 같은 뜻을 **다른 모양으로** 적은 것(찜 목록이 매대 조건을 손으로
 * 이어 적었던 일)은 글자가 겹치지 않아 여기 안 걸린다. 그 자리는 "모든 값에서 core 와 같은 답을 내는가" 를
 * 맞춰 보는 검사가 각자 지킨다(wishlist·cart-line). 패턴으로 잡히는 것과 뜻으로만 잡히는 것을 섞지 않는다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

/** 소스만 본다. node_modules 안의 @shop/core 는 같은 파일이 다시 보이는 것뿐이다 */
const SOURCES = [
  'apps/web/src',
  'packages/contract/src',
  'packages/ui/src',
  'packages/auth/src',
  'packages/db/src',
  'packages/i18n/src',
  'packages/mail/src',
];

/**
 * 베껴도 되는 자리와 그 까닭.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다 — 왜 베껴도 되는지가 남아 있어야 나중에 그 판단이
 * 아직 맞는지 볼 수 있다(의존성 권고 면제와 같은 규칙).
 */
const EXEMPT: Readonly<Record<string, string>> = {};

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (e.name === 'node_modules' || e.name === 'generated') return [];
    const path = join(dir, e.name);
    return e.isDirectory() ? walk(path) : /\.tsx?$/.test(e.name) ? [path] : [];
  });
}

/** core 가 내보내는 목록 — 이름 → 값들 */
function coreLists(): Map<string, Set<string>> {
  const found = new Map<string, Set<string>>();
  for (const file of walk(join(ROOT, 'packages/core/src'))) {
    const source = readFileSync(file, 'utf8');
    for (const m of source.matchAll(/export const ([A-Z][A-Z0-9_]+)\s*(?::[^=]+)?=\s*\[(.*?)\]\s*as const/gs)) {
      const values = [...m[2]!.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((v) => v[1]!);
      if (values.length >= 2) found.set(m[1]!, new Set(values));
    }
  }
  return found;
}

describe('core 의 목록을 베끼지 않는다', () => {
  it('core 가 내보내는 목록을 찾는다 — 못 찾으면 이 검사는 아무것도 안 본 것이다', () => {
    const lists = coreLists();
    expect(lists.size).toBeGreaterThan(20);
    // 손으로 적은 목록이 아니라 소스에서 읽어 왔는지 — 아는 것 몇 개로 확인한다
    expect(lists.get('COUPON_KIND')).toEqual(new Set(['AMOUNT', 'PERCENT']));
    expect([...(lists.get('RETURN_STATUS') ?? [])]).toContain('CANCELLED');
  });

  it('core 가 이름 붙인 묶음을 조건식으로 다시 적은 자리가 없다', () => {
    const lists = coreLists();
    /*
     * 이름 붙은 묶음 — 다른 목록의 **진부분집합**인 것. 전체 목록(ORDER_STATUS 같은)은 제외한다:
     * 그 안의 값 둘을 묻는 조건은 묶음을 베낀 것이 아니라 그냥 두 가지를 가르는 가지다.
     */
    const named = [...lists].filter(([n, v]) => [...lists].some(([n2, v2]) =>
      n2 !== n && v.size < v2.size && [...v].every((x) => v2.has(x))));
    expect(named.length, '이름 붙은 묶음을 못 찾았다 — 이 검사는 아무것도 안 본 것이다').toBeGreaterThan(3);

    const chain = /(?:[A-Za-z_$][\w$.?]*\s*===\s*'[A-Z][A-Z0-9_]*'\s*\|\|\s*)+[A-Za-z_$][\w$.?]*\s*===\s*'[A-Z][A-Z0-9_]*'/g;
    const copies: string[] = [];

    for (const dir of SOURCES) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (EXEMPT[rel]) continue;
        const source = readFileSync(file, 'utf8');

        for (const m of source.matchAll(chain)) {
          const values = new Set([...m[0].matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((v) => v[1]!));

          for (const [name, members] of named) {
            if (values.size !== members.size) continue;
            if ([...values].some((v) => !members.has(v))) continue;
            if (new RegExp(`\\b${name}\\b`).test(source)) continue;

            const line = source.slice(0, m.index).split('\n').length;
            copies.push(`${rel}:${line} — core 의 ${name} 를 조건식으로 다시 적었다`);
          }
        }
      }
    }

    expect(
      copies,
      '이름과 까닭이 붙은 묶음이다. core 의 것을 부르거나, 다시 적어야 할 까닭을 EXEMPT 에 적는다:\n' +
        copies.join('\n'),
    ).toEqual([]);
  });

  it('원본과 똑같은 목록을 다시 적은 자리가 없다', () => {
    const lists = coreLists();
    const copies: string[] = [];

    for (const dir of SOURCES) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        const source = readFileSync(file, 'utf8');

        for (const m of source.matchAll(/\[((?:\s*'[A-Z][A-Z0-9_]*'\s*,?\s*){2,})\]/g)) {
          const values = new Set([...m[1]!.matchAll(/'([A-Z][A-Z0-9_]*)'/g)].map((v) => v[1]!));

          for (const [name, members] of lists) {
            if (values.size !== members.size) continue;
            if ([...values].some((v) => !members.has(v))) continue;
            // 그 이름을 부르는 파일이면 알고 쓰는 자리다
            if (new RegExp(`\\b${name}\\b`).test(source)) continue;
            if (EXEMPT[rel]) continue;

            const line = source.slice(0, m.index).split('\n').length;
            copies.push(`${rel}:${line} — core 의 ${name} 를 통째로 다시 적었다`);
          }
        }
      }
    }

    expect(
      copies,
      '목록이 늘어날 때 이 자리는 따라오지 않는다. core 의 것을 부르거나, 베껴야 할 까닭을 EXEMPT 에 적는다:\n' +
        copies.join('\n'),
    ).toEqual([]);
  });
});
