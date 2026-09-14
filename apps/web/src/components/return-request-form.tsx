'use client';

import { useId, useState, type FormEvent } from 'react';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import {
  RETURN_TYPE, availableReturnReasons, type OrderStatus,
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
export interface ReturnableItem {
  readonly id: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly quantity: number;
  /** 지금 가진 옵션 — 교환 목록에서 "같은 옵션으로 새 상품" 을 가린다 */
  readonly variantId?: string;
  /** 교환으로 바꿀 수 있는 옵션(같은 상품·같은 가격·재고 있음). 비었으면 이 줄은 교환할 수 없다 */
  readonly exchangeOptions?: readonly { variantId: string; label: string }[];
}

export function ReturnRequestForm({
  orderNo,
  status,
  items = [],
}: {
  orderNo: string;
  /** 이 상태에서 고를 수 있는 사유만 내민다. 확정 뒤에는 판매자 귀책뿐이다. */
  status: OrderStatus;
  /**
   * 돌려보낼 수 있는 줄. 둘 이상이면 고르게 한다 — 니트만 작은데 코트까지 돌려보내게 하지 않는다.
   * 처음에는 전부 골라 둔다. 대부분은 받은 것을 통째로 무르러 온다.
   */
  items?: readonly ReturnableItem[];
}) {
  const reasons = availableReturnReasons(status);
  const router = useRouter();
  const t = useT();
  const formId = useId();
  const [open, setOpen] = useState(false);
  /*
   * 여는 순간 이 버튼이 사라지고 폼이 그 자리를 차지한다. 초점을 챙기지
   * 않으면 body 로 떨어져 키보드 사용자가 자기 자리를 잃는다.
   */
  const { triggerRef, panelRef } = useDisclosureFocus(open);
  const [type, setType] = useState<ReturnType>('RETURN');
  const [reason, setReason] = useState<ReturnReason>(reasons[0]!);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<readonly string[]>(() => items.map((i) => i.id));
  /*
   * 줄마다 바꿀 옵션. 처음에는 **다른 옵션 중 첫째**를 골라 둔다 — 교환하러 온 사람은 대개 사이즈를 바꾸러 왔다.
   * 다른 옵션이 없으면 같은 옵션(불량품을 새것으로).
   */
  const [exchangeTo, setExchangeTo] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      items.map((i) => {
        const options = i.exchangeOptions ?? [];
        return [i.id, (options.find((o) => o.variantId !== i.variantId) ?? options[0])?.variantId ?? ''];
      }),
    ));
  /** 이번 신청에 들어가는 줄 — 하나뿐인 주문은 고르는 칸 없이 그 줄 */
  const targets = items.length >= 2 ? items.filter((i) => picked.includes(i.id)) : items;

  const borneBy = shippingBorneBy(reason);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (items.length >= 2 && picked.length === 0) {
      setError(t('ret.pickItems'));
      return;
    }
    if (type === 'EXCHANGE') {
      const blocked = targets.find((i) => !exchangeTo[i.id]);
      if (blocked) {
        setError(t('ret.exchangeNone', { name: blocked.productName }));
        return;
      }
    }
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
          ...(items.length >= 2 ? { itemIds: picked } : {}),
          ...(type === 'EXCHANGE'
            ? { exchanges: targets.map((i) => ({ itemId: i.id, variantId: exchangeTo[i.id]! })) }
            : {}),
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
        ref={triggerRef}
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
      ref={panelRef}
      // 초점을 받되 탭 순서에는 넣지 않는다. 열릴 때 우리가 옮겨 줄 뿐이다.
      tabIndex={-1}
      aria-labelledby={`${formId}-title`}
      onSubmit={(e) => onSubmit(e)}
      className="flex flex-col gap-5 rounded-sm border border-[var(--border)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
    >
      <h3 id={`${formId}-title`} className="text-sm font-semibold">{t('ret.request')}</h3>

      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      {items.length >= 2 && (
        <fieldset className="flex flex-col gap-2" aria-describedby={`${formId}-items-note`}>
          <legend className="mb-1.5 text-xs font-medium text-[var(--fg-secondary)]">{t('ret.items')}</legend>
          <p id={`${formId}-items-note`} className="text-[12px] text-[var(--fg-muted)]">{t('ret.itemsNote')}</p>
          {items.map((item) => (
            <label
              key={item.id}
              className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-sm border border-[var(--border)] px-3.5 py-2 text-[13px] has-[:checked]:border-[var(--brand)]"
            >
              <input
                type="checkbox"
                checked={picked.includes(item.id)}
                onChange={(e) =>
                  setPicked((current) =>
                    e.target.checked ? [...current, item.id] : current.filter((id) => id !== item.id))}
                className="accent-[var(--brand)]"
              />
              {item.productName}
              <span className="ml-auto text-[11px] text-[var(--fg-muted)]">{item.optionLabel} · {item.quantity}</span>
            </label>
          ))}
        </fieldset>
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
              className="flex flex-1 cursor-pointer items-center gap-2 rounded-sm border border-[var(--border)] px-3.5 py-2.5 text-[13px] has-[:checked]:border-[var(--brand)]"
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

      {/* 교환이면 줄마다 무엇으로 바꿀지 — 반품과 갈리는 유일한 입력이다 */}
      {type === 'EXCHANGE' && (
        <div className="flex flex-col gap-2.5" role="group" aria-labelledby={`${formId}-exchange-title`} aria-describedby={`${formId}-exchange-note`}>
          <p id={`${formId}-exchange-title`} className="text-xs font-medium text-[var(--fg-secondary)]">{t('ret.exchangeHeading')}</p>
          <p id={`${formId}-exchange-note`} className="text-[12px] text-[var(--fg-muted)]">{t('ret.exchangeNote')}</p>
          {targets.map((item) => {
            const options = item.exchangeOptions ?? [];
            if (options.length === 0) {
              return (
                <p key={item.id} className="rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-[12px] text-[var(--fg-secondary)]">
                  {t('ret.exchangeNone', { name: item.productName })}
                </p>
              );
            }
            return (
              <div key={item.id} className="flex flex-col gap-1.5">
                <label htmlFor={`${formId}-to-${item.id}`} className="text-[13px]">
                  {t('ret.exchangeTo', { name: `${item.productName} (${item.optionLabel})` })}
                </label>
                <select
                  id={`${formId}-to-${item.id}`}
                  value={exchangeTo[item.id] ?? ''}
                  onChange={(e) => setExchangeTo((current) => ({ ...current, [item.id]: e.target.value }))}
                  className="h-11 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
                >
                  {options.map((o) => (
                    <option key={o.variantId} value={o.variantId}>
                      {o.variantId === item.variantId ? t('ret.exchangeSame', { label: o.label }) : o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-[var(--fg-secondary)]">{t('ret.reason')}</legend>
        {reasons.map((r) => (
          <label
            key={r}
            className="flex cursor-pointer items-center gap-2.5 rounded-sm border border-[var(--border)] px-3.5 py-2.5 text-[13px] has-[:checked]:border-[var(--brand)]"
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
