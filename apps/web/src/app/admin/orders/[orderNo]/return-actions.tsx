'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { format, won } from '@shop/core';
import type { CompleteReturnPreview } from '~/lib/orders/complete-return';

/**
 * 반품 승인·반려.
 *
 * **반려는 사유 없이 못 한다.** 고객이 왜 안 되는지 알아야 다음 행동을
 * 정할 수 있고, 이유 없는 반려는 그대로 문의로 돌아온다.
 *
 * 승인은 돈을 움직이지 않는다. 회수를 기다리는 상태가 될 뿐이고, 환불은
 * order:refund 권한이 따로 있는 동작이다.
 */
export function ReturnActions({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? '처리하지 못했습니다.');
        return;
      }
      setRejecting(false);
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  function onReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('rejectReason');
    const reason = typeof value === 'string' ? value.trim() : '';
    void send({ action: 'REJECT', rejectReason: reason });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      {rejecting ? (
        <form onSubmit={onReject} className="flex flex-col gap-2.5">
          <label htmlFor="rejectReason" className="text-xs font-medium text-[var(--fg-secondary)]">
            반려 사유 <span className="text-accent">*</span>
            <span className="sr-only"> (필수)</span>
          </label>
          <textarea
            id="rejectReason"
            name="rejectReason"
            required
            rows={2}
            maxLength={300}
            placeholder="고객에게 그대로 보입니다."
            className="rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
          />
          <div className="flex gap-2">
            <Button type="submit" size="md" variant="accent" disabled={pending}>
              {pending ? '반려하는 중…' : '반려'}
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => setRejecting(false)}
              disabled={pending}
            >
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="md"
            disabled={pending}
            onClick={() => send({ action: 'APPROVE' })}
          >
            {pending ? '처리 중…' : '반품 승인'}
          </Button>
          <Button type="button" size="md" variant="secondary" onClick={() => setRejecting(true)}>
            반려
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 회수 확인 · 환불.
 *
 * **누르기 전에 얼마가 나가는지 보인다.** 한 줄만 돌려받으면 그 줄의 쿠폰 몫은 빠지고, 단순
 * 변심이면 무료배송 기준 아래로 떨어진 만큼 배송비를 뗀다 — 판매가를 보고 누르면 손님에게
 * 설명할 금액과 달라진다. 주문째 돌려받으면 남은 결제 금액 전부다.
 */
export function CompleteReturnButton({
  orderNo,
  preview,
}: {
  orderNo: string;
  preview: CompleteReturnPreview | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function complete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'COMPLETE' }),
      });
      const result = (await response.json()) as { message?: string; refunded?: number };
      if (!response.ok) {
        setError(result.message ?? '환불하지 못했습니다.');
        return;
      }
      setStatus(`${format(won(result.refunded ?? 0))}원을 돌려줬습니다.`);
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        돌려보낸 물건이 도착했는지 확인한 뒤 누릅니다. 재고가 돌아오고 결제가 취소됩니다.
      </p>
      {preview?.kind === 'partial' && (
        <dl className="flex flex-col gap-1 rounded-sm bg-[var(--surface)] px-3.5 py-3 text-[13px]" aria-label="돌려줄 금액">
          <div className="flex justify-between">
            <dt className="text-[var(--fg-secondary)]">결제 수단으로</dt>
            <dd className="tnum font-semibold">{format(preview.cash)}원</dd>
          </div>
          {preview.points > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--fg-secondary)]">포인트로</dt>
              <dd className="tnum">{format(preview.points)}P</dd>
            </div>
          )}
          {preview.shippingDeducted > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--fg-secondary)]">배송비 차감 (단순 변심)</dt>
              <dd className="tnum">-{format(preview.shippingDeducted)}원</dd>
            </div>
          )}
        </dl>
      )}
      {preview?.kind === 'full' && (
        <p className="text-[13px] text-[var(--fg-secondary)]">주문의 남은 상품을 전부 돌려받습니다. 남은 결제 금액 전부를 환불합니다.</p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
      <div>
        <Button type="button" size="md" variant="accent" onClick={() => void complete()} aria-disabled={pending}>
          {pending ? '환불하는 중…' : '회수 확인 · 환불'}
        </Button>
      </div>
    </div>
  );
}
