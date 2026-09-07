'use client';

import { useId, useState } from 'react';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
import { REPORT_REASON, type ReportReason } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { REPORT_REASON_KEY } from '~/lib/i18n/enum-labels';

/**
 * 리뷰 신고.
 *
 * **사유를 고르게 한다.** 자유 입력만 받으면 무엇이 문제인지 매번 읽어야
 * 처리 순서를 정할 수 있고, 그러면 대기줄이 곧 읽을거리가 된다.
 *
 * 신고해도 글은 그 자리에 남는다. 그렇게 적어 둔다 — 누른 뒤에 아무 변화가
 * 없으면 눌리지 않은 줄 알고 다시 누른다.
 */
export function ReviewReport({
  reviewId,
  alreadyReported,
}: {
  reviewId: string;
  alreadyReported: boolean;
}) {
  const t = useT();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(alreadyReported);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * 여는 순간 이 버튼이 사라지고 폼이 그 자리를 차지한다. 초점을 챙기지
   * 않으면 body 로 떨어져 키보드 사용자가 자기 자리를 잃는다.
   */
  const { triggerRef, panelRef } = useDisclosureFocus(open);

  if (done) {
    return (
      <span className="text-[11px] text-[var(--fg-muted)]">{t('review.reported')}</span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={formId}
        className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('review.report')}
      </button>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    // FormData.get 은 File 도 돌려준다. 문자열인 것만 쓴다.
    const text = (name: string): string => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };
    const reason = text('reason');
    const detail = text('detail');

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason, detail: detail || null }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? t('review.reportFailed'));
        return;
      }
      setDone(true);
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id={formId}
      ref={panelRef}
      /*
       * 초점을 받을 수 있게 하되 탭 순서에는 넣지 않는다(-1). 열릴 때 우리가
       * 옮겨 줄 뿐, 평소에 탭으로 폼 껍데기에 걸릴 이유는 없다.
       */
      tabIndex={-1}
      aria-label={t('review.report')}
      onSubmit={(event) => void submit(event)}
      className="mt-2 flex w-full flex-col gap-2 rounded-sm bg-[var(--surface)] p-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
    >
      <fieldset className="flex flex-col gap-1.5 border-0 p-0">
        <legend className="text-[11px] font-medium">{t('review.reportReason')}</legend>
        {REPORT_REASON.map((reason: ReportReason, index) => (
          <label key={reason} className="flex items-center gap-2 text-[12px]">
            <input type="radio" name="reason" value={reason} defaultChecked={index === 0} required />
            {t(REPORT_REASON_KEY[reason])}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--fg-secondary)]">
        {t('review.reportDetail')}
        <textarea
          name="detail"
          rows={2}
          maxLength={500}
          className="rounded-sm border border-n-300 bg-[var(--bg)] p-2 text-[12px]"
        />
      </label>

      <p className="text-[11px] text-[var(--fg-muted)]">
        {t('review.reportNote')}
      </p>

      {error && (
        <span role="alert" className="text-[11px] text-accent">
          {error}
        </span>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-9 rounded-sm bg-[var(--brand)] px-3.5 text-[12px] font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {pending ? t('review.reportSending') : t('review.report')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-2 text-[12px] text-[var(--fg-secondary)] underline"
        >
          {t('common.cancel')}
        </button>
      </div>
    </form>
  );
}
