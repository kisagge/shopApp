'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '~/lib/i18n/client';

/** 내 리뷰에만 붙는 삭제. 지우지 않고 감춘다(soft delete). */
export function ReviewActions({ reviewId }: { reviewId: string }) {
  const t = useT();
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
        setError(data.message ?? t('review.deleteFailed'));
        return;
      }
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (error) return <span role="alert" className="text-[11px] text-accent">{error}</span>;

  return confirming ? (
    <span className="flex items-center gap-2 text-[11px]">
      <span className="text-[var(--fg-muted)]">{t('review.deleteAsk')}</span>
      <button type="button" onClick={() => remove()} disabled={pending} className="text-accent underline">
        {pending ? t('review.deleting') : t('review.delete')}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-[var(--fg-muted)] underline">
        {t('common.cancel')}
      </button>
    </span>
  ) : (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
    >
      {t('review.deleteMine')}
    </button>
  );
}
