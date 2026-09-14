/**
 * 재고 일괄 수정 파일을 읽는다.
 *
 * 쓰임은 송장 올리기와 같다 — **내려받은 재고 파일에서 숫자만 고쳐 다시 올린다.** 창고 실사를
 * 엑셀에 맞춰 적는 것이 보통이라, 칸 순서가 아니라 머리칸 이름으로 찾고 SKU 로 옵션을 가린다
 * (상품 이름은 겹치고 바뀐다. SKU 는 창고·정산이 읽는 값이다).
 *
 * 저장은 하지 않는다. 무엇을 적용할지와 무엇이 문제인지만 가른다 — 적용은 상품 화면의 재고
 * 수정과 같은 함수가 한다.
 */

export interface StockEntry {
  /** 대문자로 맞춘 SKU */
  readonly sku: string;
  /** 새 재고. 실사 결과를 **덮어쓴다** — 증감이 아니다 */
  readonly stock: number;
  /** 판매 여부를 적었으면 그 값, 비웠으면 건드리지 않는다 */
  readonly isActive: boolean | null;
  /** 파일에서 이 SKU 가 처음 나온 줄(머리칸 다음이 2) */
  readonly line: number;
}

export type StockUploadProblem =
  | { readonly kind: 'NO_HEADER'; readonly missing: readonly string[] }
  | { readonly kind: 'INVALID_STOCK'; readonly line: number; readonly sku: string; readonly value: string }
  | { readonly kind: 'INVALID_ACTIVE'; readonly line: number; readonly sku: string; readonly value: string }
  | { readonly kind: 'CONFLICT'; readonly sku: string; readonly lines: readonly number[] };

export interface StockUpload {
  readonly entries: readonly StockEntry[];
  readonly problems: readonly StockUploadProblem[];
  /** 재고 칸이 비어 건너뛴 줄 수. 실패가 아니다 — 고칠 줄만 채워 올리는 게 보통이다 */
  readonly skipped: number;
}

/** 한 번에 받을 수 있는 옵션 수 */
export const STOCK_UPLOAD_MAX_ROWS = 2_000;

/** 재고의 상한. 상품 화면의 재고 수정과 같은 선이다 */
export const STOCK_MAX = 999_999;

const HEADER = {
  sku: ['SKU', 'sku'],
  stock: ['재고', 'stock'],
  isActive: ['판매', '판매 여부', 'isActive', 'active'],
} as const;

const normalize = (value: string): string => value.trim().replace(/\s+/g, '').toLowerCase();

function findColumn(header: readonly string[], names: readonly string[]): number {
  const wanted = new Set(names.map(normalize));
  return header.findIndex((h) => wanted.has(normalize(h)));
}

/**
 * 재고 숫자.
 *
 * 엑셀은 1,000 처럼 천 단위 쉼표를 붙여 저장하기도 해서 받는다. 소수·음수·글자는 거절한다 —
 * "12개" 를 12 로 읽으면 편하지만, "1.5" 를 1 로 읽는 순간 실사 수량이 조용히 틀린다.
 */
export function parseStock(raw: string): number | null {
  const value = raw.trim().replace(/,/g, '');
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return Number.isSafeInteger(n) && n <= STOCK_MAX ? n : null;
}

const ACTIVE_TRUE = ['판매중', '판매', 'y', 'yes', 'true', '1', 'o'];
const ACTIVE_FALSE = ['판매중지', '중지', 'n', 'no', 'false', '0', 'x'];

/** 판매 여부. 비었으면 건드리지 않음(null), 모르는 말이면 undefined */
export function parseActive(raw: string): boolean | null | undefined {
  const value = normalize(raw);
  if (value === '') return null;
  if (ACTIVE_TRUE.includes(value)) return true;
  if (ACTIVE_FALSE.includes(value)) return false;
  return undefined;
}

/** 내보낼 때 쓰는 말. 올릴 때 그대로 받는다 */
export const activeLabel = (isActive: boolean): string => (isActive ? '판매중' : '판매중지');

export function readStockUpload(rows: readonly (readonly string[])[]): StockUpload {
  const [header, ...body] = rows;
  const col = {
    sku: header ? findColumn(header, HEADER.sku) : -1,
    stock: header ? findColumn(header, HEADER.stock) : -1,
    isActive: header ? findColumn(header, HEADER.isActive) : -1,
  };

  const missing = (['sku', 'stock'] as const).filter((k) => col[k] < 0).map((k) => HEADER[k][0]);
  if (missing.length > 0) {
    return { entries: [], problems: [{ kind: 'NO_HEADER', missing }], skipped: 0 };
  }

  const problems: StockUploadProblem[] = [];
  /** SKU 별로 모은 값. 같은 SKU 가 두 번 나오면 값이 같을 때만 받는다 */
  const bySku = new Map<string, { stock: number; isActive: boolean | null; lines: number[] }[]>();
  const firstLine = new Map<string, number>();
  let skipped = 0;

  body.forEach((cells, i) => {
    const line = i + 2;
    const sku = (cells[col.sku] ?? '').trim().toUpperCase();
    if (sku === '') return;

    const rawStock = cells[col.stock] ?? '';
    if (rawStock.trim() === '') {
      skipped += 1;
      return;
    }
    const stock = parseStock(rawStock);
    if (stock === null) {
      problems.push({ kind: 'INVALID_STOCK', line, sku, value: rawStock.trim() });
      return;
    }

    const rawActive = col.isActive >= 0 ? (cells[col.isActive] ?? '') : '';
    const isActive = parseActive(rawActive);
    if (isActive === undefined) {
      problems.push({ kind: 'INVALID_ACTIVE', line, sku, value: rawActive.trim() });
      return;
    }

    if (!firstLine.has(sku)) firstLine.set(sku, line);
    const seen = bySku.get(sku) ?? [];
    const same = seen.find((s) => s.stock === stock && s.isActive === isActive);
    if (same) same.lines.push(line);
    else seen.push({ stock, isActive, lines: [line] });
    bySku.set(sku, seen);
  });

  const entries: StockEntry[] = [];
  for (const [sku, values] of bySku) {
    /*
     * **같은 SKU 에 다른 숫자가 적혀 있으면 추측하지 않는다.** 한 줄만 고치고 다른 줄을 깜빡한
     * 경우가 대부분인데 어느 쪽이 실사 결과인지 모른다. 틀린 쪽을 고르면 없는 물건을 판다.
     */
    if (values.length > 1) {
      problems.push({ kind: 'CONFLICT', sku, lines: values.flatMap((v) => v.lines).sort((a, b) => a - b) });
      continue;
    }
    const only = values[0]!;
    entries.push({ sku, stock: only.stock, isActive: only.isActive, line: firstLine.get(sku) ?? 0 });
  }

  return { entries, problems, skipped };
}
