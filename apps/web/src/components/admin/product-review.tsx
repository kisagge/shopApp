'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 게시 검수 결정.
 *
 * **반려에는 사유를 받는다.** 이유 없이 되돌리면 가맹점은 무엇을 고쳐야
 * 할지 모르고, 그대로 다시 올려서 같은 일이 반복된다. 서버도 같은 것을
 * 요구하지만(REJECT_REASON_REQUIRED), 눌러 본 뒤에 알게 하지 않는다.
 */
export function ProductReview({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const reasonId = useId();

  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState<'approve' | 'reject' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setPending(approve ? 'approve' : 'reject');
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/review`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approve, reason: approve ? null : reason.trim() }),
      });

      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(null);
    }
  }

  if (rejecting) {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={reasonId} className="text-[11px] text-[var(--fg-secondary)]">
          {productName} 반려 사유
        </label>
        <textarea
          id={reasonId}
          rows={2}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] p-2 text-[12px]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void decide(false)}
            disabled={reason.trim().length === 0 || pending !== null}
            className="h-8 rounded-sm bg-accent px-3 text-[12px] font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {pending === 'reject' ? '반려 중…' : '반려'}
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            className="h-8 px-2 text-[12px] text-[var(--fg-secondary)] underline"
          >
            취소
          </button>
        </div>
        {error && (
          <span role="alert" className="text-[11px] text-accent">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void decide(true)}
        disabled={pending !== null}
        className="h-8 rounded-sm bg-[var(--brand)] px-3 text-[12px] font-medium text-[var(--bg)] disabled:opacity-50"
      >
        {pending === 'approve' ? '게시 중…' : '게시'}
      </button>
      <button
        type="button"
        onClick={() => setRejecting(true)}
        className="h-8 rounded-sm border border-[var(--border-strong)] px-3 text-[12px]"
      >
        반려
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-accent">
          {error}
        </span>
      )}
    </div>
  );
}
