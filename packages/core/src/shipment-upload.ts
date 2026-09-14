import { CARRIERS, CARRIER_CODE, type CarrierCode } from './carrier';

/**
 * 송장 일괄 올리기 파일을 읽는다.
 *
 * **주문을 내려받아 송장번호를 채워 다시 올리는 것**이 이 기능의 실제 쓰임이다 —
 * 국내 쇼핑몰은 대개 그렇게 한다(주문 내려받기 → 택배사 프로그램 → 송장 올리기).
 * 그래서 우리가 내보낸 파일을 그대로 받아야 한다: 칸 순서가 아니라 **머리칸
 * 이름**으로 찾고, 택배사는 코드(CJ)와 이름(CJ대한통운)을 둘 다 받는다.
 *
 * 저장은 하지 않는다. 무엇을 적용할지와 무엇이 문제인지만 가른다 — 적용은 한 건
 * 등록과 같은 함수가 한다.
 */

export interface ShipmentEntry {
  readonly orderNo: string;
  readonly carrier: CarrierCode;
  readonly trackingNumber: string;
  /** 파일에서 이 주문이 처음 나온 줄(머리칸 다음이 2) */
  readonly line: number;
}

export type ShipmentUploadProblem =
  | { readonly kind: 'NO_HEADER'; readonly missing: readonly string[] }
  | { readonly kind: 'UNKNOWN_CARRIER'; readonly line: number; readonly orderNo: string; readonly carrier: string }
  | { readonly kind: 'MISSING_CARRIER'; readonly line: number; readonly orderNo: string }
  | {
      readonly kind: 'CONFLICT';
      readonly orderNo: string;
      readonly lines: readonly number[];
    };

export interface ShipmentUpload {
  readonly entries: readonly ShipmentEntry[];
  readonly problems: readonly ShipmentUploadProblem[];
  /** 송장번호 칸이 비어 있어 건너뛴 주문 수. 실패가 아니다 — 일부만 채워 올리는 게 보통이다 */
  readonly skipped: number;
}

/** 한 번에 받을 수 있는 주문 수 */
export const SHIPMENT_UPLOAD_MAX_ORDERS = 1_000;

const HEADER = {
  orderNo: ['주문번호', 'orderNo', 'order_no'],
  carrier: ['택배사', 'carrier'],
  trackingNumber: ['송장번호', 'trackingNumber', 'tracking_number'],
} as const;

const normalize = (value: string): string => value.trim().replace(/\s+/g, '').toLowerCase();

function findColumn(header: readonly string[], names: readonly string[]): number {
  const wanted = new Set(names.map(normalize));
  return header.findIndex((h) => wanted.has(normalize(h)));
}

/** 코드(CJ)도 이름(CJ대한통운)도 받는다. 모르면 null */
export function resolveCarrier(raw: string): CarrierCode | null {
  const value = normalize(raw);
  if (value === '') return null;
  const byCode = CARRIER_CODE.find((c) => normalize(c) === value);
  if (byCode) return byCode;
  return CARRIERS.find((c) => normalize(c.name) === value)?.code ?? null;
}

export function readShipmentUpload(rows: readonly (readonly string[])[]): ShipmentUpload {
  const [header, ...body] = rows;
  const col = {
    orderNo: header ? findColumn(header, HEADER.orderNo) : -1,
    carrier: header ? findColumn(header, HEADER.carrier) : -1,
    trackingNumber: header ? findColumn(header, HEADER.trackingNumber) : -1,
  };

  const missing = (Object.keys(col) as (keyof typeof col)[])
    .filter((k) => col[k] < 0)
    .map((k) => HEADER[k][0]);
  if (missing.length > 0) {
    return { entries: [], problems: [{ kind: 'NO_HEADER', missing }], skipped: 0 };
  }

  /*
   * **주문번호로 묶는다.** 내보낸 파일은 항목 하나당 한 줄이라 한 주문이 여러 번
   * 나온다. 줄마다 등록하면 같은 송장을 여러 번 쓴다.
   */
  const byOrder = new Map<string, { carrier: string; tracking: string; lines: number[] }[]>();
  const firstLine = new Map<string, number>();

  body.forEach((cells, i) => {
    const line = i + 2;
    const orderNo = (cells[col.orderNo] ?? '').trim();
    if (orderNo === '') return;

    const carrier = (cells[col.carrier] ?? '').trim();
    const tracking = (cells[col.trackingNumber] ?? '').trim();

    if (!firstLine.has(orderNo)) firstLine.set(orderNo, line);
    const seen = byOrder.get(orderNo) ?? [];
    const same = seen.find((s) => s.carrier === carrier && s.tracking === tracking);
    if (same) same.lines.push(line);
    else seen.push({ carrier, tracking, lines: [line] });
    byOrder.set(orderNo, seen);
  });

  const entries: ShipmentEntry[] = [];
  const problems: ShipmentUploadProblem[] = [];
  let skipped = 0;

  for (const [orderNo, variants] of byOrder) {
    const filled = variants.filter((v) => v.tracking !== '');

    if (filled.length === 0) {
      skipped += 1;
      continue;
    }

    /*
     * **같은 주문에 송장이 둘 적혀 있으면 추측하지 않는다.** 한 줄만 고치고 다른 줄을
     * 깜빡한 경우가 대부분인데, 어느 쪽이 새것인지 우리는 모른다. 고르면 절반의
     * 확률로 손님이 남의 택배를 조회하게 된다.
     */
    if (filled.length > 1) {
      problems.push({
        kind: 'CONFLICT',
        orderNo,
        lines: filled.flatMap((v) => v.lines).sort((a, b) => a - b),
      });
      continue;
    }

    const only = filled[0]!;
    const line = firstLine.get(orderNo) ?? 0;

    if (only.carrier === '') {
      problems.push({ kind: 'MISSING_CARRIER', line, orderNo });
      continue;
    }
    const carrier = resolveCarrier(only.carrier);
    if (!carrier) {
      problems.push({ kind: 'UNKNOWN_CARRIER', line, orderNo, carrier: only.carrier });
      continue;
    }

    entries.push({ orderNo, carrier, trackingNumber: only.tracking, line });
  }

  return { entries, problems, skipped };
}
