import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, calculateSettlement, settlementPeriod, won,
  type Actor,
} from '@shop/core';
import { previewSettlements, settlementDeductionWhere, settlementSaleWhere } from '~/lib/admin/close-settlement';

/**
 * 정산 내역 내려받기.
 *
 * 정산 화면은 가맹점마다 합계 한 줄이다. 가맹점은 **그 숫자가 어느 주문에서 왔는지** 맞춰 봐야 한다 —
 * 자기 장부의 판매와 대조하고, 빠진 주문이 있으면 물어볼 근거가 있어야 한다. 그래서 판매 줄과 차감
 * 줄을 하나씩 내려주고, 끝에 가맹점마다 합계(판매·수수료·차감·지급액)를 붙인다.
 *
 * **줄을 고르는 조건은 정산 초안과 하나다**(settlementSaleWhere · settlementDeductionWhere). 따로 적으면
 * 파일의 합이 화면의 정산 금액과 어긋나고, 그때는 어느 쪽도 믿을 수 없다.
 *
 * 손님의 정보는 없다 — 주문번호·상품·금액뿐이다.
 */

export const SETTLEMENT_EXPORT_MAX_ROWS = 20_000;

export class SettlementExportTooLargeError extends Error {
  constructor(readonly rows: number) {
    super(`내려받을 줄이 ${rows.toLocaleString('ko-KR')}개로 한도(${SETTLEMENT_EXPORT_MAX_ROWS.toLocaleString('ko-KR')})를 넘습니다. 가맹점을 골라 받아 주세요.`);
    this.name = 'SettlementExportTooLargeError';
  }
}

export const SETTLEMENT_CSV_HEADER = ['구분', '가맹점', '주문번호', '기준일시', '상품', '옵션', '수량', '금액'] as const;

const kst = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
});

export async function exportSettlementLines(
  actor: Actor,
  yearMonth: string,
  /** 운영진이 한 가맹점만 받을 때. 가맹점 계정은 무엇을 보내도 자기 것이다 */
  merchantId?: string,
): Promise<(string | number)[][]> {
  assertPermission(actor, 'settlement:read');
  const period = settlementPeriod(yearMonth);
  const scope = actor.merchantId ?? merchantId;

  const merchants = await prisma.merchant.findMany({
    where: scope ? { id: scope } : {},
    orderBy: { name: 'asc' },
    select: { id: true, name: true, commissionPercent: true },
  });
  const merchantName = new Map(merchants.map((m) => [m.id, m.name]));

  /*
   * **확정된 기간은 그때의 요율로 적는다.**
   *
   * 예전에는 가맹점의 **지금** 요율로 다시 계산했다. 그러면 요율을 바꾼 뒤 지난달 파일을 받았을 때 확정된 정산
   * 행과 수수료가 어긋난다 — 둘 다 우리가 준 숫자인데 서로 다르면 가맹점은 어느 쪽도 믿을 수 없다.
   * 아직 확정하지 않은 기간은 확정될 때의 요율이 곧 지금 요율이므로 그대로 쓴다.
   */
  const frozen = new Map(
    (
      await prisma.settlement.findMany({
        where: { periodStart: period.start, periodEnd: period.end, ...(scope ? { merchantId: scope } : {}) },
        select: { merchantId: true, commissionPercent: true },
      })
    ).map((s) => [s.merchantId, s.commissionPercent]),
  );

  const saleWhere = settlementSaleWhere(period, scope);
  const deductionWhere = settlementDeductionWhere(period, scope);
  const [saleCount, deductionCount] = await Promise.all([
    prisma.orderItem.count({ where: saleWhere }),
    prisma.orderItem.count({ where: deductionWhere }),
  ]);
  if (saleCount + deductionCount > SETTLEMENT_EXPORT_MAX_ROWS) {
    throw new SettlementExportTooLargeError(saleCount + deductionCount);
  }

  const select = {
    merchantId: true, productName: true, optionLabel: true, quantity: true, subtotal: true, canceledAt: true,
    order: { select: { orderNo: true, confirmedAt: true } },
  } as const;
  const [sales, deductions] = await Promise.all([
    prisma.orderItem.findMany({ where: saleWhere, select, orderBy: [{ order: { confirmedAt: 'asc' } }, { id: 'asc' }] }),
    prisma.orderItem.findMany({ where: deductionWhere, select, orderBy: [{ canceledAt: 'asc' }, { id: 'asc' }] }),
  ]);

  const rows: (string | number)[][] = [];
  const totals = new Map<string, { gross: number; refund: number }>();
  const add = (id: string, key: 'gross' | 'refund', amount: number) => {
    const t = totals.get(id) ?? { gross: 0, refund: 0 };
    t[key] += amount;
    totals.set(id, t);
  };

  for (const line of sales) {
    const id = line.merchantId!;
    rows.push([
      '판매', merchantName.get(id) ?? id, line.order.orderNo, kst.format(line.order.confirmedAt!),
      line.productName, line.optionLabel, line.quantity, line.subtotal,
    ]);
    add(id, 'gross', line.subtotal);
  }
  for (const line of deductions) {
    const id = line.merchantId!;
    // 빼는 돈은 음수로 적는다 — 금액 칸을 그대로 더하면 지급액 전(수수료 전)이 나오게
    rows.push([
      '차감(확정 뒤 반품)', merchantName.get(id) ?? id, line.order.orderNo, kst.format(line.canceledAt!),
      line.productName, line.optionLabel, line.quantity, -line.subtotal,
    ]);
    add(id, 'refund', line.subtotal);
  }

  /*
   * 가맹점마다 합계. 계산은 화면의 정산과 같은 함수(calculateSettlement)로 한다 — 수수료 반올림 하나만
   * 달라도 파일과 지급액이 1원씩 어긋난다.
   */
  /*
   * **앞선 달에서 넘어온 빚도 적는다.** 화면의 지급액은 그것을 뺀 금액이라, 파일에 없으면 합계가 화면과 어긋난다.
   * 무엇이 넘어오는지는 화면의 초안과 같은 계산(previewSettlements)에서 가져온다 — 따로 세면 둘이 갈린다.
   */
  const carried = new Map(
    (await previewSettlements(scope ? { ...actor, merchantId: scope } : actor, yearMonth))
      .map((d) => [d.merchantId, d.carriedAmount] as const),
  );

  for (const m of merchants) {
    const carry = carried.get(m.id) ?? 0;
    const t = totals.get(m.id) ?? (carry !== 0 ? { gross: 0, refund: 0 } : undefined);
    if (!t) continue;
    const percent = frozen.get(m.id) ?? m.commissionPercent;
    const amounts = calculateSettlement({
      gross: won(t.gross), commissionPercent: percent, refund: won(t.refund), carried: won(carry),
    });
    rows.push(['합계 · 판매', m.name, '', '', '', '', '', amounts.grossAmount]);
    rows.push([`합계 · 수수료 ${percent}%`, m.name, '', '', '', '', '', 0 - amounts.commissionAmount]);
    rows.push(['합계 · 차감', m.name, '', '', '', '', '', 0 - amounts.refundAmount]);
    if (amounts.carriedAmount !== 0) {
      rows.push(['합계 · 앞선 달 이월', m.name, '', '', '', '', '', amounts.carriedAmount]);
    }
    rows.push(['합계 · 지급액', m.name, '', '', '', '', '', amounts.netAmount]);
  }

  return rows;
}
