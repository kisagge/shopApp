'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';

/**
 * 주문 상태 전이 버튼.
 *
 * 어떤 전이가 가능한지는 서버가 상태머신으로 계산해 내려 준다.
 * 화면이 자기 나름의 규칙을 갖고 있으면 서버와 어긋나고, 그 어긋남은
 * 버튼을 눌러야 드러난다.
 */
export function OrderStatusActions({
  orderNo,
  options,
}: {
  orderNo: string;
  options: readonly OrderStatus[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<OrderStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function move(to: OrderStatus) {
    setError(null);
    setMessage(null);
    setPending(to);

    const res = await fetch(`/api/admin/orders/${orderNo}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ to }),
    });
    setPending(null);

    const body = (await res.json()) as {
      message?: string;
      waitingForOthers?: boolean;
      itemsMoved?: number;
    };

    if (!res.ok) {
      setError(body.message ?? '상태를 변경하지 못했습니다.');
      return;
    }
    setMessage(
      body.waitingForOthers
        ? `내 상품 ${body.itemsMoved}건을 ${ORDER_STATUS_LABEL[to]} 처리했습니다. 다른 가맹점 상품이 남아 주문 전체 상태는 아직 그대로입니다.`
        : `${ORDER_STATUS_LABEL[to]}(으)로 변경했습니다.`,
    );
    router.refresh();
  }

  if (options.length === 0) {
    return (
      <p className="text-[13px] text-[var(--fg-muted)]">
        더 이상 변경할 수 있는 상태가 없습니다.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {options.map((to) => (
          <li key={to}>
            {/*
              **왜 못 누르는지 말한다.** 하나를 보내는 동안 나머지도 잠기는데,
              보내는 중인 것은 이름이 '처리 중…' 으로 바뀌어 스스로 설명하는
              반면 나머지는 이름이 그대로다. 낭독기에는 "배송중(으)로 변경,
              사용 불가" 만 들리고 왜인지는 어디에도 없었다.
            */}
            <Button
              block
              variant={to === 'CANCELLED' ? 'danger' : 'primary'}
              aria-disabled={pending !== null}
              aria-describedby={pending !== null && pending !== to ? 'status-busy' : undefined}
              onClick={() => move(to)}
            >
              {pending === to ? '처리 중…' : `${ORDER_STATUS_LABEL[to]}(으)로 변경`}
            </Button>
          </li>
        ))}
      </ul>
      {pending !== null && (
        <p id="status-busy" className="sr-only">
          처리가 끝난 뒤에 누를 수 있습니다
        </p>
      )}

      {message && (
        <p role="status" className="rounded-sm bg-success-soft px-3 py-2.5 text-[13px] text-success">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}
    </div>
  );
}
