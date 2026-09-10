'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { PaymentMethodInput } from '@shop/contract';
import type { PaymentMode } from '@shop/core';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';
import { payOrder } from '~/lib/checkout/pay-order';

/**
 * 결제가 걸리지 않은 주문에 **다시 결제를 건다.**
 *
 * **이 단추가 없어서 사람이 갇혔다.** 승인이 실패하면 주문은 만들어진 채
 * 결제대기로 남는데, 결제 화면은 "주문 내역에서 다시 시도할 수 있습니다"
 * 라고 말하면서 그 화면에는 취소 단추만 두었다. 배포에서 주문
 * 20260910-7063897 이 그렇게 갇혔고 할 수 있는 것은 취소뿐이었다.
 *
 * 서버가 이 단추를 붙일지 정한다(`isRepayable`). 특히 가상계좌로 계좌를
 * 이미 받은 주문에는 붙지 않는다 — 거기서 할 일은 송금이지 재결제가 아니고,
 * 다시 걸면 옛 계좌로 넣은 돈이 갈 곳을 잃는다.
 */
export function RepayButton({
  orderNo,
  payable,
  method,
  orderName,
  paymentMode,
}: {
  orderNo: string;
  payable: number;
  method: PaymentMethodInput;
  /** 결제창 제목 — 주문에 박힌 상품명을 서버가 만들어 준다 */
  orderName: string;
  /** 서버가 정한 결제 방식. 브라우저는 다시 정하지 않는다 */
  paymentMode: PaymentMode;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setError(null);
    setPending(true);
    const result = await payOrder({ mode: paymentMode, orderNo, payable, method, orderName });
    setPending(false);

    // 결제창이 열렸으면 브라우저는 곧 떠난다. 여기서 할 일이 없다.
    if (result.kind === 'window') return;

    if (result.kind === 'windowFailed') {
      setError(t('repay.windowFailed'));
      return;
    }
    if (result.kind === 'confirmFailed') {
      setError(result.message ?? t('checkout.approveFailed'));
      return;
    }
    // 승인됐다. 상태가 바뀌었으니 화면을 다시 받아 온다.
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <Button block onClick={pay} disabled={pending}>
        {pending ? t('repay.pending') : t('repay.button')}
      </Button>
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}
    </div>
  );
}
