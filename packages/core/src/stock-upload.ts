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
  /**
   * 내려받을 때의 재고. 내려받은 파일에만 있다 — 없으면 null(사람이 직접 만든 실사 파일).
   *
   * **이것이 있어야 그사이 팔린 수량을 되살리지 않는다.** 10시에 받은 파일(재고 10)을 11시에 올리면
   * 그사이 3개가 팔려 지금은 7인데, 이 칸이 없을 때는 "파일의 10 과 지금의 7 이 다르다" 며 10 으로
   * 되돌렸다. 고치지도 않은 줄이 없는 물건 3개를 만들었다. 판단은 stockUploadDecision 이 한다.
   */
  readonly base: number | null;
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
  base: ['내려받은 재고', 'base', 'baseStock'],
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
    base: header ? findColumn(header, HEADER.base) : -1,
    isActive: header ? findColumn(header, HEADER.isActive) : -1,
  };

  const missing = (['sku', 'stock'] as const).filter((k) => col[k] < 0).map((k) => HEADER[k][0]);
  if (missing.length > 0) {
    return { entries: [], problems: [{ kind: 'NO_HEADER', missing }], skipped: 0 };
  }

  const problems: StockUploadProblem[] = [];
  /** SKU 별로 모은 값. 같은 SKU 가 두 번 나오면 값이 같을 때만 받는다 */
  const bySku = new Map<string, { stock: number; isActive: boolean | null; base: number | null; lines: number[] }[]>();
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

    // 내려받은 재고는 우리가 적은 값이다. 읽을 수 없으면 없는 것으로 본다 — 그 줄은 덮어쓰기가 된다
    const base = col.base >= 0 ? parseStock(cells[col.base] ?? '') : null;

    if (!firstLine.has(sku)) firstLine.set(sku, line);
    const seen = bySku.get(sku) ?? [];
    const same = seen.find((s) => s.stock === stock && s.isActive === isActive && s.base === base);
    if (same) same.lines.push(line);
    else seen.push({ stock, isActive, base, lines: [line] });
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
    entries.push({ sku, stock: only.stock, isActive: only.isActive, base: only.base, line: firstLine.get(sku) ?? 0 });
  }

  return { entries, problems, skipped };
}

/**
 * 올린 한 줄을 어떻게 할까.
 *
 * · `UNCHANGED` — 손대지 않은 줄이다. **지금 재고가 달라졌어도** 그대로 둔다(그사이 팔렸을 뿐이다).
 * · `APPLY` — 고친 줄이다. 쓸 때 "지금도 내려받은 값인가" 를 조건으로 건다(expected).
 * · `MOVED` — 고쳤는데 그사이 재고가 움직였다. 파일의 숫자는 옛 재고를 보고 적은 것이라 그대로 쓰면
 *   그사이 팔린 것이 사라지거나 들어온 것이 지워진다. 다시 내려받아 고치게 한다.
 *
 * 내려받은 값이 없는 파일(사람이 만든 실사 파일)은 예전처럼 **덮어쓴다** — 실사 결과가 곧 재고라는
 * 뜻으로 올린 것이고, 비교할 기준이 없다. 값이 지금과 같으면 건드리지 않는다.
 */
export type StockUploadDecision =
  | { readonly kind: 'UNCHANGED' }
  /** stock 은 쓸 재고, expected 는 "지금도 이 값일 때만" 의 조건(없으면 덮어쓴다) */
  | { readonly kind: 'APPLY'; readonly stock: number; readonly expected: number | null }
  | { readonly kind: 'MOVED'; readonly base: number; readonly current: number };

export function stockUploadDecision(input: {
  readonly entry: Pick<StockEntry, 'stock' | 'base' | 'isActive'>;
  readonly current: { readonly stock: number; readonly isActive: boolean };
}): StockUploadDecision {
  const { entry, current } = input;
  const activeChanged = entry.isActive !== null && entry.isActive !== current.isActive;

  if (entry.base === null) {
    return entry.stock === current.stock && !activeChanged
      ? { kind: 'UNCHANGED' }
      : { kind: 'APPLY', stock: entry.stock, expected: null };
  }

  const stockEdited = entry.stock !== entry.base;
  if (!stockEdited) {
    // 재고는 손대지 않았다. 판매 여부만 바꿨으면 그것만 쓴다 — 재고는 지금 값을 그대로 둔다
    return activeChanged
      ? { kind: 'APPLY', stock: current.stock, expected: current.stock }
      : { kind: 'UNCHANGED' };
  }
  if (current.stock !== entry.base) {
    return { kind: 'MOVED', base: entry.base, current: current.stock };
  }
  return { kind: 'APPLY', stock: entry.stock, expected: entry.base };
}
