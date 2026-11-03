'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
import { PRODUCT_REPORT_REASON, type ProductReportReason } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { PRODUCT_REPORT_REASON_KEY } from '~/lib/i18n/enum-labels';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 상품 신고.
 *
 * **사유를 고르게 한다.** 자유 입력만 받으면 무엇이 문제인지 매번 읽어야 처리 순서를 정할
 * 수 있고, 그러면 대기줄이 곧 읽을거리가 된다. 리뷰 신고가 같은 결론에 먼저 닿았다.
 *
 * 신고해도 상품은 그 자리에 남는다. 그렇게 적어 둔다 — 누른 뒤에 아무 변화가 없으면 눌리지
 * 않은 줄 알고 다시 누른다. 내리는 것은 운영진이 보고 정한다(`AUTO_ARCHIVE_ON_REPORTS`).
 */
export function ProductReport({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const t = useT();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /*
   * 여는 순간 이 단추가 사라지고 폼이 그 자리를 차지한다. 초점을 챙기지 않으면 `<body>` 로
   * 떨어져 키보드 사용자가 자기 자리를 잃는다.
   */
  const { triggerRef, panelRef } = useDisclosureFocus(open);
  /** 신고를 마친 뒤 결과로 초점을 옮긴다 — 단추가 사라진 자리를 대신하는 것이 이 글이다 */
  const resultRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (done) resultRef.current?.focus();
  }, [done]);

  if (done) {
    /*
     * **결과가 폼을 대신한다 — 초점과 알림을 둘 다 챙긴다.** 단추가 사라지면서 초점이
     * `<body>` 로 떨어지면 키보드 사용자는 문서 처음부터 다시 훑어야 하고, 낭독기는
     * 아무 말도 하지 않는다 — 신고가 됐는지 알 길이 없다.
     */
    return (
      <p
        ref={resultRef}
        role="status"
        tabIndex={-1}
        className="text-[12px] text-[var(--fg-muted)] focus:outline-none"
      >
        {t('productReport.done')}
      </p>
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
        className="text-[12px] text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('productReport.open')}
      </button>
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 보내는 중에 다시 눌리면 같은 신고가 두 번 나간다 — 유니크 제약이 막지만 409 를 보게 된다
    if (pending) return;

    const form = new FormData(event.currentTarget);
    // FormData.get 은 File 도 돌려준다. 문자열인 것만 쓴다.
    const text = (name: string): string => {
      const value = form.get(name);
      return typeof value === 'string' ? value.trim() : '';
    };

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/products/${productId}/report`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: text('reason'), detail: text('detail') || null }),
      });

      // ok 를 보고 나서 본문을 읽는다 — 502 가 HTML 이면 읽는 줄이 던진다
      if (!response.ok) {
        setError(await failureMessage(response, t('productReport.failed')));
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
      /* 초점을 받되 탭 순서에는 넣지 않는다 — 열릴 때 옮겨 줄 뿐이다 */
      tabIndex={-1}
      aria-label={t('productReport.title', { name: productName })}
      onSubmit={(event) => void submit(event)}
      className="mt-2 flex w-full flex-col gap-2 rounded-sm bg-[var(--surface)] p-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
    >
      <fieldset className="flex flex-col gap-1.5 border-0 p-0">
        <legend className="text-[12px] font-medium">{t('productReport.reason')}</legend>
        {PRODUCT_REPORT_REASON.map((reason: ProductReportReason, index) => (
          <label key={reason} className="flex min-h-9 items-center gap-2 text-[12px]">
            <input type="radio" name="reason" value={reason} defaultChecked={index === 0} required />
            {t(PRODUCT_REPORT_REASON_KEY[reason])}
          </label>
        ))}
      </fieldset>

      <label className="flex flex-col gap-1 text-[11px] text-[var(--fg-secondary)]">
        {t('productReport.detail')}
        <textarea
          name="detail"
          rows={2}
          maxLength={500}
          className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] p-2 text-[12px]"
        />
      </label>

      <p className="text-[11px] text-[var(--fg-muted)]">{t('productReport.note')}</p>

      {error && (
        <span role="alert" className="text-[12px] text-accent">
          {error}
        </span>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-sm bg-[var(--brand)] px-3.5 text-[12px] font-medium text-[var(--bg)] disabled:opacity-50"
        >
          {pending ? t('productReport.sending') : t('productReport.submit')}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-10 px-2 text-[12px] text-[var(--fg-secondary)] underline"
        >
          {t('productReport.cancel')}
        </button>
      </div>
    </form>
  );
}
