'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@shop/core';
import { failureMessage } from '~/lib/client/failure-message';

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

  /**
   * **눌리는 것을 막지 않으므로 여기서 막는다.**
   *
   * `Button` 은 disabled 대신 aria-disabled 를 쓴다 — 못 누르는 버튼은 초점을 못 받아 왜 못
   * 누르는지 들리지 않기 때문이고, 그 판단은 옳다. 대신 **눌리기는 하므로 조건을 핸들러가
   * 지켜야 한다**(주문 만들기·주문 취소가 같은 까닭으로 같은 처방을 쓴다).
   *
   * 여기가 안 지키고 있었다. 보내는 동안 화면에는 '처리 중…' 만 뜨므로, 안 눌린 줄 안
   * 운영자가 **바로 옆의 '취소됨(으)로 변경'** 을 누르면 두 전이가 동시에 날아간다.
   * 이 화면에서 가장 되돌리기 어려운 단추가 그 옆에 있다.
   *
   * state 가 아니라 ref 로 본다. 빠른 두 번 누름은 리액트가 다시 그리기 전에 둘 다
   * `pending === null` 을 읽을 수 있고, 그러면 막은 적이 없는 것과 같다.
   */
  const sending = useRef(false);

  async function move(to: OrderStatus) {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    setMessage(null);
    setPending(to);

    /*
     * **길이 끊기는 것도 끝이다.** try 가 없어서 끊기면 `pending` 이 그 상태에 박히고,
     * 버튼 전부가 영영 잠겼다 — 아무 말도 없이. 운영 화면에서는 그것이 죽은 화면이다.
     *
     * 실패한 응답은 `failureMessage` 로 읽는다. 502 가 HTML 을 주면 `json()` 이 던지는데,
     * 그걸 안 잡으면 서버가 한 말 대신 "네트워크 오류" 가 뜬다 — 그 함수가 바로 그 일을
     * 겪고 생겼다(이용 정지 폼).
     */
    try {
      const res = await fetch(`/api/admin/orders/${orderNo}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ to }),
      });

      if (!res.ok) {
        setError(await failureMessage(res, '상태를 변경하지 못했습니다.'));
        return;
      }

      const body = (await res.json().catch(() => ({}))) as {
        waitingForOthers?: boolean;
        itemsMoved?: number;
      };
      setMessage(
        body.waitingForOthers
          ? `내 상품 ${body.itemsMoved}건을 ${ORDER_STATUS_LABEL[to]} 처리했습니다. 다른 가맹점 상품이 남아 주문 전체 상태는 아직 그대로입니다.`
          : `${ORDER_STATUS_LABEL[to]}(으)로 변경했습니다.`,
      );
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(null);
      sending.current = false;
    }
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
