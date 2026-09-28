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


/**
 * 배송완료 일괄 처리 파일을 읽는다.
 *
 * **송장은 한 번에 올리는데 도착 처리는 주문마다 눌러야 했다.** 500건을 올려 놓고 500번을 누르는 셈이라,
 * 주문이 조금만 늘어도 실제로는 안 눌린다. 그런데 **배송완료일부터 시계가 돈다** — 반품·교환 기한도,
 * 자동 구매확정도, 후기를 쓸 수 있는 때도. 안 눌리면 손님은 반품 신청조차 못 한다.
 *
 * 같은 파일을 쓴다. 주문 내려받기 파일에는 주문번호 칸이 있으므로, 배송중인 주문을 내려받아 그대로
 * 올리면 된다 — 송장 올리기가 "내려받은 파일이 곧 올리는 양식" 인 것과 같은 결이다.
 *
 * 저장은 하지 않는다. 어느 주문인지만 가른다 — 옮기는 일은 한 건 상태 변경과 같은 함수가 한다.
 */
export interface DeliveryEntry {
  readonly orderNo: string;
  /** 파일에서 이 주문이 처음 나온 줄(머리칸 다음이 2) */
  readonly line: number;
}

export interface DeliveryUpload {
  readonly entries: readonly DeliveryEntry[];
  readonly problems: readonly { readonly kind: 'NO_HEADER'; readonly missing: readonly string[] }[];
  /** 같은 주문이 여러 줄에 나와 묶인 수. 실패가 아니다 — 내보낸 파일은 항목마다 한 줄이다 */
  readonly merged: number;
}

export function readDeliveryUpload(rows: readonly (readonly string[])[]): DeliveryUpload {
  const [header, ...body] = rows;
  const at = header ? findColumn(header, HEADER.orderNo) : -1;
  if (at < 0) {
    return { entries: [], problems: [{ kind: 'NO_HEADER', missing: [HEADER.orderNo[0]] }], merged: 0 };
  }

  /*
   * **주문번호로 묶는다.** 내보낸 파일은 항목 하나당 한 줄이라 한 주문이 여러 번 나온다. 줄마다 옮기면
   * 두 번째부터는 "이미 배송완료" 로 실패하고, 운영자는 멀쩡한 처리를 실패 목록으로 보게 된다.
   */
  const firstLine = new Map<string, number>();
  let merged = 0;

  body.forEach((cells, i) => {
    const orderNo = (cells[at] ?? '').trim();
    if (orderNo === '') return;
    if (firstLine.has(orderNo)) {
      merged += 1;
      return;
    }
    firstLine.set(orderNo, i + 2);
  });

  return {
    entries: [...firstLine].map(([orderNo, line]) => ({ orderNo, line })),
    problems: [],
    merged,
  };
}
