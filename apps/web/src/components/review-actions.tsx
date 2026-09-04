'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** 내 리뷰에만 붙는 삭제. 지우지 않고 감춘다(soft delete). */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setError(data.message ?? '삭제하지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 삭제하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (error) return <span role="alert" className="text-[11px] text-accent">{error}</span>;

  return confirming ? (
    <span className="flex items-center gap-2 text-[11px]">
      <span className="text-[var(--fg-muted)]">삭제할까요?</span>
      <button type="button" onClick={() => remove()} disabled={pending} className="text-accent underline">
        {pending ? '삭제 중…' : '삭제'}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-[var(--fg-muted)] underline">
        취소
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
    >
      내 리뷰 삭제
    </button>
  );
}
