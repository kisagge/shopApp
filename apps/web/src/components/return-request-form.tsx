'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import {
  RETURN_TYPE, RETURN_REASON,
  shippingBorneBy, returnWindowDays,
  type ReturnReason, type ReturnType,
} from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { RETURN_TYPE_KEY, RETURN_REASON_KEY } from '~/lib/i18n/enum-labels';

/**
 * 반품·교환 신청.
 *
 * **반송비를 누가 내는지 고르기 전에 알려 준다.** 신청하고 나서 알게 되면
 * 속았다고 느낀다. 사유를 바꾸는 순간 문구도 함께 바뀐다.
 *
 * 부담 주체를 화면에서 계산해 보여 주지만 **그 값을 서버로 보내지는 않는다.**
 * 서버가 사유에서 다시 정한다 — 보내면 누구나 판매자 부담으로 바꿀 수 있다.
 */
export function ReturnRequestForm({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const t = useT();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<ReturnType>('RETURN');
  const [reason, setReason] = useState<ReturnReason>('CHANGED_MIND');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const borneBy = shippingBorneBy(reason);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const detail = data.get('detail');

    try {
      const response = await fetch(`/api/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type,
          reason,
          ...(typeof detail === 'string' && detail.trim() ? { detail: detail.trim() } : {}),
        }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? t('ret.failed'));
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setOpen(true)}
        aria-expanded={false}
        aria-controls={formId}
      >
        {t('ret.request')}
      </Button>
    );
  }

  return (
    <form
      id={formId}
      onSubmit={(e) => onSubmit(e)}
      className="flex flex-col gap-5 rounded-sm border border-[var(--border)] p-4"
    >
      <h3 className="text-sm font-semibold">{t('ret.request')}</h3>

      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-[var(--fg-secondary)]">
          {t('ret.what')}
        </legend>
        <div className="flex gap-2">
          {/* 반복 변수를 kind 라고 부른다 — t 로 두면 문구 함수를 가린다 */}
          {RETURN_TYPE.map((kind) => (
            <label
              key={kind}
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-sm border border-[var(--border)] px-3.5 py-2.5 text-[13px] has-[:checked]:border-n-900"
            >
              <input
                type="radio"
                name="type"
                value={kind}
                checked={type === kind}
                onChange={() => setType(kind)}
                className="accent-[var(--brand)]"
              />
              {t(RETURN_TYPE_KEY[kind])}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-[var(--fg-secondary)]">{t('ret.reason')}</legend>
        {RETURN_REASON.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-[var(--border)] px-3.5 py-2.5 text-[13px] has-[:checked]:border-n-900"
          >
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-[var(--brand)]"
            />
            {t(RETURN_REASON_KEY[r])}
          </label>
        ))}
      </fieldset>

      {/*
        반송비 부담과 기한을 사유 바로 아래에 붙인다. aria-live 로 사유를
        바꿀 때마다 읽힌다 — 눈으로만 바뀌면 스크린리더 사용자는 어떤 조건으로
        신청하는지 모른 채 제출하게 된다.
      */}
      <p
        aria-live="polite"
        className="rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--fg-secondary)]"
      >
        {borneBy === 'CUSTOMER' ? (
          <>
            {t('ret.byCustomer', { days: returnWindowDays(reason) })}
          </>
        ) : (
          <>
            {t('ret.bySeller', { days: returnWindowDays(reason) })}
          </>
        )}
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor={`${formId}-detail`} className="text-xs font-medium text-[var(--fg-secondary)]">
          {t('ret.detail')} <span className="text-[var(--fg-muted)]">{t('ret.optional')}</span>
        </label>
        <textarea
          id={`${formId}-detail`}
          name="detail"
          rows={3}
          maxLength={500}
          placeholder={t('ret.detailPlaceholder')}
          className="rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3.5 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? t('ret.submitting') : t('ret.submit')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}
