'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TrackedLink as Link } from '~/components/tracked-link';
import { useT } from '~/lib/i18n/client';
import { failureMessage } from '~/lib/client/failure-message';

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
        /*
         * 서버가 한 말을 `failureMessage` 로 읽는다. 앞단이 502 HTML 이나 빈 본문을 주면
         * `json()` 이 던지고, 그대로 두면 아래 catch 가 받아 **서버가 답했는데 "네트워크
         * 오류" 라고 적는다** — 그 함수가 겪고 생긴 일이다.
         */
        setError(await failureMessage(response, t('review.deleteFailed')));
        return;
      }
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  /*
   * **실패하면 단추가 모두 사라지고 있었다.**
   *
   * 까닭을 적는 것까지는 맞는데 단추 **대신** 적었다 — 지우기가 한 번 실패하면 고치기까지
   * 함께 없어져, 다시 눌러 볼 수도 그 말을 치울 수도 없다. 화면을 새로 받기 전까지.
   * 운영 화면의 오류 처리 단추가 같은 모양이었다. 까닭은 곁에 적고 단추는 그 자리에 둔다.
   */
  const failure = error && (
    <span role="alert" className="text-[11px] text-accent">{error}</span>
  );

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
      {failure}
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
      {failure}
    </>
  );
}
