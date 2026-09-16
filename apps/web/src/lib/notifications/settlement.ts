import 'server-only';
import { prisma } from '@shop/db';
import { yearMonthOf } from '@shop/core';
import { recordNotifications, type NoticeInput } from './record';

/**
 * 정산이 확정됐다 / 지급이 나갔다는 것을 **그 가맹점에게** 알린다.
 *
 * 마감은 배치가 새벽에 돌고 지급은 운영진이 누른다 — 둘 다 가맹점이 없는 자리에서
 * 일어나는 일이라, 지금까지 가맹점은 정산 화면을 열어 뱃지가 바뀐 것을 보고서야
 * 알았다. 돈이 오가는 일에 그렇게 두면 "들어왔나" 를 확인하러 며칠씩 화면을
 * 여닫게 된다.
 *
 * 받는 사람은 그 가맹점에 소속된 계정 전부다. 한 가맹점에 담당자가 여럿일 수 있고,
 * 누가 돈을 챙기는지는 우리가 모른다 — 재고 부족 알림과 같은 자리다.
 *
 * **실패해도 던지지 않는다.** 부르는 자리에서는 정산이 이미 확정됐고 지급도 이미
 * 나갔다. 알림을 못 남겼다고 그것을 무를 수는 없다.
 */

/** 그 가맹점들에 소속된 계정. 가맹점 없는 계정(운영진·손님)은 걸리지 않는다 */
async function staffOf(merchantIds: readonly string[]) {
  return prisma.user.findMany({
    where: { merchantId: { in: [...merchantIds] }, role: 'MERCHANT' },
    select: { id: true, merchantId: true },
  });
}

/** 금액은 말이 달라도 같게 읽히도록 쉼표만 넣어 싣는다 — 단위는 문구가 붙인다 */
const amountText = (won: number): string => won.toLocaleString('en-US');

export async function notifySettlementClosed(
  yearMonth: string,
  rows: readonly { readonly merchantId: string; readonly netAmount: number }[],
): Promise<void> {
  if (rows.length === 0) return;

  try {
    const amountBy = new Map(rows.map((r) => [r.merchantId, r.netAmount]));
    const staff = await staffOf([...amountBy.keys()]);

    const notices: NoticeInput[] = [];
    for (const person of staff) {
      const netAmount = person.merchantId === null ? undefined : amountBy.get(person.merchantId);
      if (netAmount === undefined) continue;

      notices.push({
        userId: person.id,
        kind: 'SETTLEMENT_CLOSED',
        params: { period: yearMonth, amount: amountText(netAmount) },
        // 기간은 문구에 실려 있다. 화면은 앞 달을 기본으로 열고, 다른 달은 거기서 고른다
        linkPath: '/admin/settlements',
      });
    }

    await recordNotifications(notices);
  } catch (error) {
    console.error('[notification] 정산 확정 알림을 못 만들었다', { yearMonth }, error);
  }
}

/**
 * 어느 달 정산인지는 **행이 든 시작 시각에서 읽는다.** 부르는 쪽에서 계산해 넘기면
 * 그 계산이 이 함수의 try 밖에서 일어나, 실패했을 때 이미 나간 지급이 에러가 된다.
 */
export async function notifySettlementPaid(input: {
  readonly merchantId: string;
  readonly periodStart: Date;
  readonly netAmount: number;
}): Promise<void> {
  try {
    const staff = await staffOf([input.merchantId]);

    await recordNotifications(staff.map((person): NoticeInput => ({
      userId: person.id,
      kind: 'SETTLEMENT_PAID',
      params: { period: yearMonthOf(input.periodStart), amount: amountText(input.netAmount) },
      linkPath: '/admin/settlements',
    })));
  } catch (error) {
    console.error('[notification] 정산 지급 알림을 못 만들었다', input, error);
  }
}
