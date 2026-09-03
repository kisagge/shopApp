'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

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
            onClick={() => void send({ action: 'APPROVE' })}
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
