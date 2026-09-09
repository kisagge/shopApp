import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * **주문을 거르는 축과 인덱스가 어긋나지 않게 지킨다.**
 *
 * 매출을 주문한 시각이 아니라 돈이 오간 시각에 잡도록 바꾸면서, 질의는
 * `paidAt`·`canceledAt`·`confirmedAt` 으로 옮겼는데 인덱스는 `placedAt` 축에
 * 그대로 두었다. 아무것도 터지지 않았다 — 시드 275행에서는 Postgres 가 어차피
 * 전면 훑기를 고르므로 화면도 검사도 멀쩡했다. 30만 행을 넣고 나서야
 * `Parallel Seq Scan` 이 보였다.
 *
 * 조용한 실수라 검사로 막는다. **시각 컬럼을 범위로 거르는 자리를 소스에서
 * 찾아**, 그 컬럼이 인덱스의 앞자리에 있는지 본다. 다음에 축을 옮기는 사람은
 * 인덱스를 함께 옮기거나, 왜 필요 없는지 아래에 적어야 한다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const SCHEMA = join(ROOT, 'packages/db/prisma/schema.prisma');
const LIB = join(ROOT, 'apps/web/src/lib');

/** 주문이 들고 있는 시각 칸 */
const TIME_COLUMNS = [
  'placedAt', 'paidAt', 'shippedAt', 'deliveredAt', 'confirmedAt', 'canceledAt',
] as const;

/**
 * 인덱스가 없어도 되는 축과 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Partial<Record<(typeof TIME_COLUMNS)[number], string>>> = {};

/** Order 모델이 들고 있는 인덱스들 */
function orderIndexes(): readonly (readonly string[])[] {
  const schema = readFileSync(SCHEMA, 'utf8');
  const model = /^model Order \{([\s\S]*?)^\}/m.exec(schema)?.[1] ?? '';
  return [...model.matchAll(/@@index\(\[([^\]]+)\]\)/g)].map((m) =>
    m[1]!.split(',').map((c) => c.trim().replace(/\(.*\)$/, '')),
  );
}

function sources(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory()
      ? sources(full)
      : name.endsWith('.ts')
        ? [readFileSync(full, 'utf8')]
        : [];
  });
}

/**
 * 범위로 거르는 시각 칸을 찾는다.
 *
 * Prisma 문법(`paidAt: { gte: ... }`)과 raw SQL(`o."paidAt" >= ...`) 둘 다 본다 —
 * 대시보드의 날짜별 집계는 raw 로 적혀 있어서 한쪽만 보면 놓친다.
 */
function filteredColumns(): ReadonlySet<string> {
  const source = sources(LIB).join('\n');
  const found = new Set<string>();
  for (const column of TIME_COLUMNS) {
    const prisma = new RegExp(`\\b${column}:\\s*\\{[^}]*\\b(gte|lte|gt|lt)\\b`);
    const raw = new RegExp(`"${column}"\\s*(>=|<=|>|<)`);
    if (prisma.test(source) || raw.test(source)) found.add(column);
  }
  return found;
}

describe('주문을 거르는 축', () => {
  const indexes = orderIndexes();
  const filtered = [...filteredColumns()];

  it('찾는 것이 있다 — 정규식이 헛돌면 아래가 전부 통과한다', () => {
    expect(indexes.length).toBeGreaterThan(2);
    expect(filtered.length).toBeGreaterThan(2);
  });

  it.each(filtered)('%s 로 거르는 질의에 쓸 인덱스가 있다', (column) => {
    if (column in EXEMPT) return;

    /*
     * 앞자리이거나, 앞이 status 인 두 칸짜리면 쓸 수 있다. 상태로 좁힌 뒤
     * 시각으로 훑는 것이 이 앱의 질의 모양이다.
     */
    const usable = indexes.filter(
      (idx) => idx[0] === column || (idx[0] === 'status' && idx[1] === column),
    );

    expect(
      usable.length,
      `${column} 을 범위로 거르는 질의가 있는데 쓸 인덱스가 없다.\n` +
        `schema.prisma 의 Order 에 @@index([${column}]) 또는 @@index([status, ${column}]) 를 더하거나,\n` +
        `필요 없다면 EXEMPT 에 이유와 함께 적는다.\n` +
        `지금 있는 인덱스: ${indexes.map((i) => `[${i.join(', ')}]`).join(' ')}`,
    ).toBeGreaterThan(0);
  });

  it('면제 목록에 이유 없이 적힌 것이 없다', () => {
    expect(Object.entries(EXEMPT).filter(([, why]) => (why ?? '').trim().length < 20)).toEqual([]);
  });

  /** 안 쓰는 축에 인덱스만 남으면 쓰기만 비싸진다 */
  it('시각 인덱스는 전부 실제로 거르는 축이다', () => {
    const timeIndexed = indexes
      .map((idx) => (idx[0] === 'status' ? idx[1] : idx[0]))
      .filter((c): c is string => c !== undefined && (TIME_COLUMNS as readonly string[]).includes(c));

    expect([...new Set(timeIndexed)].filter((c) => !filtered.includes(c))).toEqual([]);
  });
});
