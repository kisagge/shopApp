'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { failureMessage } from '~/lib/client/failure-message';

type Action = 'remove' | 'dismiss' | 'restore';

/**
 * 리뷰 한 건에 붙는 운영 동작.
 *
 * **글을 내리는 것만 확인을 받는다.** 남의 글을 지우는 일이고, 되돌릴 수는
 * 있지만 그 사이 상품 화면에서는 사라진다. 신고를 닫는 것과 되돌리는 것은
 * 잘못 눌러도 같은 자리에서 되돌릴 수 있으므로 한 번에 실행한다.
 */
export function ReviewModeration({
  reviewId,
  removed,
  openReports,
}: {
  reviewId: string;
  removed: boolean;
  openReports: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: Action) {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(
        action === 'remove'
          ? `/api/reviews/${reviewId}`
          : `/api/admin/reviews/${reviewId}/${action}`,
        { method: action === 'remove' ? 'DELETE' : 'POST' },
      );

      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return;
      }

      setConfirming(false);
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-[var(--surface-2)] pt-3">
      {removed ? (
        <button
          type="button"
          onClick={() => void run('restore')}
          disabled={pending !== null}
          className="h-9 rounded-sm border border-[var(--border-strong)] px-3.5 text-[12px] disabled:opacity-50"
        >
          {pending === 'restore' ? '되돌리는 중…' : '되돌리기'}
        </button>
      ) : confirming ? (
        <>
          <span className="text-[12px] text-[var(--fg-secondary)]">
            이 글을 내릴까요? 상품 화면에서 사라집니다.
          </span>
          <button
            type="button"
            onClick={() => void run('remove')}
            disabled={pending !== null}
            className="h-9 rounded-sm bg-accent px-3.5 text-[12px] font-medium text-[var(--bg)] disabled:opacity-50"
          >
            {pending === 'remove' ? '내리는 중…' : '내린다'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="h-9 px-2 text-[12px] text-[var(--fg-secondary)] underline"
          >
            취소
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-9 rounded-sm border border-[var(--border-strong)] px-3.5 text-[12px]"
          >
            글 내리기
          </button>
          {openReports > 0 && (
            <button
              type="button"
              onClick={() => void run('dismiss')}
              disabled={pending !== null}
              className="h-9 rounded-sm border border-[var(--border-strong)] px-3.5 text-[12px] disabled:opacity-50"
            >
              {pending === 'dismiss' ? '처리 중…' : '문제없음'}
            </button>
          )}
        </>
      )}

      {error && (
        <span role="alert" className="text-[12px] text-accent">
          {error}
        </span>
      )}
    </div>
  );
}
