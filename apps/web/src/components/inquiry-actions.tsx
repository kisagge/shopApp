'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANSWER_MAX_LENGTH } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { failureMessage } from '~/lib/client/failure-message';

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

  /** 해냈으면 true. 부른 쪽이 뒷정리를 할지 정한다. */
  async function run(url: string, init: RequestInit): Promise<boolean> {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(url, init);
      if (!response.ok) {
        setError(await failureMessage(response, t('common.failed')));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(t('common.networkError'));
      return false;
    } finally {
      setPending(false);
    }
  }

  /**
   * **답을 올리고 나서 폼이 그대로 열려 있었다.**
   *
   * 새로고침으로 답변이 위에 나타나는데, 그 바로 아래 쓰던 칸이 같은 글을 그대로
   * 쥔 채 남았다. 올라간 건지 아닌지 알 수 없으니 한 번 더 누르게 되고, 서버는
   * 이미 답한 문의라 409 를 준다 — **방금 성공한 사람에게 "이미 답변한
   * 문의입니다" 를 보여 주는 셈**이다.
   *
   * 폼 갈래는 `canAnswer` 를 보지 않으므로, 새로고침 뒤 답할 수 없게 되어도
   * 저 혼자 열려 있다. 해냈으면 여기서 닫는다.
   */
  async function postAnswer() {
    const done = await run(`/api/inquiries/${inquiryId}/answer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ answer: answer.trim() }),
    });
    if (!done) return;

    setAnswering(false);
    setAnswer('');
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
          className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[13px]"
        />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void postAnswer()}
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
