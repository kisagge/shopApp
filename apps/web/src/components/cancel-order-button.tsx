'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/**
 * 주문 취소.
 *
 * 되돌릴 수 없는 동작이라 한 번 더 묻는다. 사유를 필수로 받는 이유는
 * 감사 로그에 남기기 위해서다 — 나중에 "왜 취소됐지" 를 답할 수 있어야 한다.
 */
export function CancelOrderButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('단순 변심');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function cancel() {
    setError(null);
    setPending(true);
    const res = await fetch(`/api/orders/${orderNo}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || '단순 변심' }),
    });
    setPending(false);

    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      setError(body.message ?? '주문을 취소하지 못했습니다.');
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="danger" block onClick={() => setConfirming(true)}>
          주문 취소
        </Button>
        {error && (
          <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-accent p-4">
      <p className="text-[13px] font-semibold">주문을 취소할까요?</p>
      <p className="text-xs leading-relaxed text-[var(--fg-secondary)]">
        결제한 금액은 환불되고, 사용한 포인트와 쿠폰은 돌려받습니다. 되돌릴 수 없습니다.
      </p>
      <label htmlFor="cancel-reason" className="text-xs font-medium">
        취소 사유
      </label>
      <input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        className="h-11 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-[13px]"
      />
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button variant="secondary" block onClick={() => setConfirming(false)} aria-disabled={pending}>
          돌아가기
        </Button>
        <Button variant="accent" block onClick={() => void cancel()} aria-disabled={pending}>
          {pending ? '취소 중…' : '주문 취소'}
        </Button>
      </div>
    </div>
  );
}
