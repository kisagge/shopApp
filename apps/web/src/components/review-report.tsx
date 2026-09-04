'use client';

import { useId, useState } from 'react';
import { REPORT_REASON, REPORT_REASON_LABEL, type ReportReason } from '@shop/core';

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
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(alreadyReported);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <span className="text-[11px] text-[var(--fg-muted)]">신고함</span>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={formId}
        className="text-[11px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        신고
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
        setError(data.message ?? '신고하지 못했습니다.');
        return;
      }
      setDone(true);
    } catch {
      setError('네트워크 오류로 신고하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id={formId}
      onSubmit={(event) => void submit(event)}
      className="mt-2 flex w-full flex-col gap-2 rounded-sm bg-[var(--surface)] p-3"
    >
      <fieldset className="flex flex-col gap-1.5 border-0 p-0">
        <legend className="text-[11px] font-medium">신고 사유</legend>
        {REPORT_REASON.map((reason: ReportReason, index) => (
          <label key={reason} className="flex items-center gap-2 text-[12px]">
            <input type="radio" name="reason" value={reason} defaultChecked={index === 0} required />
            {REPORT_REASON_LABEL[reason]}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--fg-secondary)]">
        설명 (선택)
        <textarea
          name="detail"
          rows={2}
          maxLength={500}
          className="rounded-sm border border-n-300 bg-[var(--bg)] p-2 text-[12px]"
        />
      </label>

      <p className="text-[11px] text-[var(--fg-muted)]">
        신고해도 글은 그대로 남습니다. 운영진이 확인한 뒤 판단합니다.
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
          {pending ? '보내는 중…' : '신고'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-9 px-2 text-[12px] text-[var(--fg-secondary)] underline"
        >
          취소
        </button>
      </div>
    </form>
  );
}
