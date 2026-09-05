'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANSWER_MAX_LENGTH } from '@shop/core';
import { useT } from '~/lib/i18n/client';

/**
 * 문의 한 건에 붙는 동작.
 *
 * 상품 화면에서 바로 답할 수 있게 둔다 — 답할 사람은 어드민보다 상품
 * 페이지를 먼저 보게 되고, 거기서 답할 수 없으면 화면을 옮겨 다녀야 한다.
 */
export function InquiryActions({
  inquiryId,
  canDelete,
  canAnswer,
}: {
  inquiryId: string;
  canDelete: boolean;
  canAnswer: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const answerId = useId();

  const [answering, setAnswering] = useState(false);
  const [answer, setAnswer] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(url: string, init: RequestInit) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? t('common.failed'));
        return;
      }
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (answering) {
    return (
      <div className="mt-1 flex flex-col gap-2">
        <label htmlFor={answerId} className="text-[12px] font-medium">
          {t('inq.answer')}
        </label>
        <textarea
          id={answerId}
          rows={3}
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          maxLength={ANSWER_MAX_LENGTH}
          className="rounded-sm border border-n-300 bg-[var(--bg)] p-3 text-[13px]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              void run(`/api/inquiries/${inquiryId}/answer`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ answer: answer.trim() }),
              })
            }
            disabled={answer.trim().length === 0 || pending}
            className="h-9 rounded-sm bg-[var(--brand)] px-3.5 text-[12px] font-medium text-[var(--bg)] disabled:opacity-40"
          >
            {pending ? t('inq.answerPosting') : t('inq.answerPost')}
          </button>
          <button
            type="button"
            onClick={() => setAnswering(false)}
            className="h-9 px-2 text-[12px] text-[var(--fg-secondary)] underline"
          >
            {t('common.cancel')}
          </button>
        </div>
        {error && (
          <span role="alert" className="text-[12px] text-accent">
            {error}
          </span>
        )}
      </div>
    );
  }

  return (
    <p className="flex flex-wrap items-center gap-3 text-[11px]">
      {canAnswer && (
        <button
          type="button"
          onClick={() => setAnswering(true)}
          className="text-[var(--fg-secondary)] underline underline-offset-2"
        >
          {t('inq.answerDo')}
        </button>
      )}

      {canDelete &&
        (confirming ? (
          <>
            <span className="text-[var(--fg-muted)]">{t('review.deleteAsk')}</span>
            <button
              type="button"
              onClick={() => void run(`/api/inquiries/${inquiryId}`, { method: 'DELETE' })}
              disabled={pending}
              className="text-accent underline"
            >
              {pending ? t('review.deleting') : t('review.delete')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-[var(--fg-muted)] underline"
            >
              {t('common.cancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="text-[var(--fg-muted)] underline underline-offset-2"
          >
            {t('inq.deleteMine')}
          </button>
        ))}

      {error && (
        <span role="alert" className="text-accent">
          {error}
        </span>
      )}
    </p>
  );
}
