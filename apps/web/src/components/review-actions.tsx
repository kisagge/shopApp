'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { useT } from '~/lib/i18n/client';

/**
 * 내 리뷰에만 붙는 고치기·지우기.
 *
 * 지우기는 본인이 누르면 행을 없앤다 — 주문 항목당 하나라는 제약 때문에 흔적을 남기면 같은 구매로 다시 쓸 수 없다.
 */
export function ReviewActions({
  reviewId,
  /** 고치는 화면 자체에서는 자기 자신으로 가는 길을 그리지 않는다 */
  showEdit = true,
}: {
  reviewId: string;
  showEdit?: boolean;
}) {
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
    /* 지우기를 묻는 동안에는 고치기를 감춘다 — 물음 옆에 다른 길을 늘어놓으면 무엇을 누르는지 흐려진다 */
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
    <>
      {/*
        고치는 자리는 마이페이지다. 상품 화면 안에서 바로 고치게 하면 그 화면이 읽는 자리인지 쓰는 자리인지 흐려지고,
        사진까지 다루려면 목록 한가운데에 폼이 하나 더 들어온다. 여기서는 **그 자리로 가는 길**만 연다.
      */}
      {showEdit && (
        <Link
          href={`/mypage/reviews/${reviewId}/edit`}
          className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
        >
          {t('review.edit')}
        </Link>
      )}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('review.deleteMine')}
      </button>
    </>
  );
}
