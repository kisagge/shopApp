import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 브라우저로 가는 화면은 계약(@shop/contract)에서 **값을 가져오지 않는다.**
 *
 * 계약은 Zod 를 안고 있다. 'use client' 파일이 계약에서 상수 하나라도 값으로
 * 가져오면 Zod 가 통째로 브라우저 번들에 들어간다 — 실제로 그렇게 됐었다.
 * PAYMENT_METHOD 하나 때문에 /checkout 이 /cart 보다 398KB 를 더 받고 있었고,
 * 결제 화면이라 하필 가장 무거우면 안 되는 자리였다.
 *
 * 허용하는 두 가지:
 *   - `import type { … } from '@shop/contract'` — 타입은 컴파일에서 사라진다
 *   - `await import('@shop/contract')` — 스키마가 필요한 순간에만 받아 온다
 *     (useLazySchema 가 쓰는 방식)
 *
 * 값 목록이 필요하면 @shop/core 에 둔다. 계약은 그 목록으로 스키마를 만든다.
 */

const SRC = join(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return walk(full);
    return /\.tsx?$/.test(e.name) ? [full] : [];
  });
}

/**
 * 정적 import 문만 — `await import(...)` 은 잡지 않는다.
 *
 * 절 안에 따옴표를 금지해 두 줄 이상 걸치지 못하게 한다. 이게 없으면 앞선
 * import 줄부터 삼켜 엉뚱한 파일을 범인으로 지목한다(실제로 그랬다).
 */
const STATIC_IMPORT = /^import\s+(type\s+)?([^'";]*?)from\s+['"]@shop\/contract['"]/gm;

describe('클라이언트 번들에 계약이 들어가지 않는다', () => {
  const clientFiles = walk(SRC).filter((f) =>
    /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')),
  );

  it('훑을 화면이 실제로 있다', () => {
    // 목록이 비면 검사가 통과해 버린다 — 그 상태를 통과로 치지 않는다
    expect(clientFiles.length).toBeGreaterThan(10);
  });

  it("'use client' 파일은 계약을 타입으로만 가져온다", () => {
    const offenders: string[] = [];

    for (const file of clientFiles) {
      const source = readFileSync(file, 'utf8');
      for (const m of source.matchAll(STATIC_IMPORT)) {
        const [, typeKeyword = '', clause = ''] = m;
        if (typeKeyword) continue; // import type { … }

        // `import { type A, type B }` — 중괄호 안이 전부 type 이면 이것도 사라진다
        const names = clause
          .replace(/[{}]/g, '')
          .split(',')
          .map((n) => n.trim())
          .filter(Boolean);
        const allTypes = names.length > 0 && names.every((n) => n.startsWith('type '));
        if (allTypes) continue;

        offenders.push(`${file.slice(SRC.length + 1)} — ${names.join(', ')}`);
      }
    }

    expect(
      offenders,
      '계약에서 값을 가져오면 Zod 가 브라우저로 따라간다. 값 목록은 @shop/core 로 옮기고, ' +
        '스키마가 필요하면 useLazySchema 로 미뤄 받는다:\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});
