'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { formatMoney, formatNumber } from '@shop/i18n';
import type { CancelItemsPreviewResponse } from '@shop/contract';
import { useLocale, useT } from '~/lib/i18n/client';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
import { failureMessage } from '~/lib/client/failure-message';

export interface CancelableItem {
  readonly id: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly quantity: number;
  readonly subtotal: number;
}

/** 고를 때마다 서버에 묻지 않고 잠깐 멈췄을 때 묻는다 */
const PREVIEW_DELAY_MS = 250;

/**
 * 일부 상품 취소.
 *
 * **돌려받을 금액은 서버가 센다.** 고른 상품의 판매가를 더해 보여 주면 틀린다 — 그 줄에
 * 붙은 쿠폰 할인은 빠지고, 포인트로 낸 몫은 포인트로 돌아가고, 남는 상품이 무료배송 기준
 * 아래로 떨어지면 배송비를 뗀다. 화면이 따로 세면 누르고 나서 금액이 달라진다. 고를 때마다
 * `preview` 로 물어 결제 취소와 같은 계산을 보여 준다.
 *
 * 되돌릴 수 없는 동작이라 펼쳐야 보인다. 고른 상품이 없으면 누르는 단추가 잠기고, 왜
 * 잠겼는지 말한다.
 */
export function CancelItemsForm({
  orderNo,
  items,
}: {
  orderNo: string;
  items: readonly CancelableItem[];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const ids = { legend: useId(), reason: useId(), pick: useId(), preview: useId() };

  const [open, setOpen] = useState(false);
  // 여는 단추가 사라지는 모양이다 — 열면 폼으로, 닫으면 단추로 초점을 옮긴다
  const { triggerRef, panelRef } = useDisclosureFocus(open);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const [reason, setReason] = useState(t('cancel.defaultReason'));
  const [preview, setPreview] = useState<CancelItemsPreviewResponse | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState('');
  const asked = useRef(0);
  const timer = useRef<number | null>(null);

  const money = (amount: number) => formatMoney(locale, amount);

  /*
   * 고를 때(이벤트 안에서) 묻는다. 효과에서 묻지 않는 이유 — 고른 목록이 바뀐 **뒤에** 한 번
   * 더 그리면서 금액을 지우고 다시 채우게 되고, 그 사이 옛 금액이 한 번 비친다.
   */
  function askPreview(next: readonly string[]) {
    if (timer.current !== null) window.clearTimeout(timer.current);
    setPreview(null);
    // 늦게 온 옛 답이 새 답을 덮지 않게 번호를 붙인다
    const ticket = ++asked.current;
    if (next.length === 0) {
      setCalculating(false);
      return;
    }
    setCalculating(true);
    timer.current = window.setTimeout(() => {
      void fetch(`/api/orders/${orderNo}/cancel-items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        // 사유는 금액을 바꾸지 않는다. 검증을 통과할 값만 싣는다
        body: JSON.stringify({ itemIds: next, reason: t('cancel.defaultReason'), preview: true }),
      })
        .then(async (res) => {
          const body = (await res.json()) as CancelItemsPreviewResponse & { message?: string };
          if (ticket !== asked.current) return;
          if (!res.ok) {
            setError(body.message ?? t('cancel.failed'));
            return;
          }
          setError(null);
          setPreview(body);
        })
        .catch(() => {
          if (ticket === asked.current) setError(t('cancel.failed'));
        })
        .finally(() => {
          if (ticket === asked.current) setCalculating(false);
        });
    }, PREVIEW_DELAY_MS);
  }

  function toggle(id: string, on: boolean) {
    setDone('');
    const next = on ? [...picked, id] : picked.filter((x) => x !== id);
    setPicked(next);
    askPreview(next);
  }

  async function submit() {
    if (picked.length === 0 || pending || calculating) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${orderNo}/cancel-items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemIds: picked, reason: reason.trim() || t('cancel.defaultReason') }),
      });
      if (!res.ok) {
        setError(await failureMessage(res, t('cancel.failed')));
        return;
      }
      setDone(t('cancel.itemsDone', { count: formatNumber(locale, picked.length) }));
      setPicked([]);
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('cancel.failed'));
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    /*
     * **골라 취소할 것이 하나 이하여도 이 자리는 남는다.** 두 줄 중 하나를 취소하면 화면이 새로
     * 그려지고 남은 줄은 하나다 — 예전에는 그때 이 부품이 통째로 사라져서 방금 띄운 "취소했습니다"
     * 도 함께 사라졌다. 사람도 낭독기도 끝났다는 말을 못 듣는다. 문지기의 e2e 가 잡았다.
     */
    return (
      <div className="flex flex-col gap-2">
        {items.length >= 2 && (
          <Button ref={triggerRef} variant="secondary" block onClick={() => setOpen(true)} aria-expanded={false}>
            {t('cancel.itemsOpen')}
          </Button>
        )}
        {/* 끝났다는 말은 접힌 뒤에도 남아야 한다. 화면은 새로 그려져 조용히 바뀐다 */}
        <p aria-live="polite" className="text-center text-[12px] text-[var(--fg-muted)]">{done}</p>
      </div>
    );
  }

  const blocked = picked.length === 0 || pending || calculating;

  return (
    <form
      ref={panelRef}
      // 초점을 받되 탭 순서에는 넣지 않는다. 열릴 때 옮겨 줄 뿐이다
      tabIndex={-1}
      aria-labelledby={ids.legend}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-4 rounded-sm border border-[var(--border-strong)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
    >
      <fieldset aria-describedby={`${ids.legend}-note`} className="flex flex-col gap-2.5">
        <legend id={ids.legend} className="mb-1 text-[13px] font-semibold">{t('cancel.itemsLegend')}</legend>
        <p id={`${ids.legend}-note`} className="text-xs leading-relaxed text-[var(--fg-secondary)]">
          {t('cancel.itemsNote')}
        </p>
        {items.map((item) => (
          <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px]">
            <input
              type="checkbox"
              checked={picked.includes(item.id)}
              onChange={(e) => toggle(item.id, e.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span className="flex flex-1 flex-col">
              <span>{item.productName}</span>
              <span className="text-[11px] text-[var(--fg-muted)]">
                {item.optionLabel} · <span className="tnum">{formatNumber(locale, item.quantity)}</span>
              </span>
            </span>
            <span className="tnum">{money(item.subtotal)}</span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={ids.reason} className="text-xs font-medium">{t('cancel.reason')}</label>
        <input
          id={ids.reason}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={200}
          className="h-11 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
        />
      </div>

      {/*
        금액이 바뀌면 소리로도 알린다. 계산 중에는 옛 금액을 치운다 — 새로 고른 것과 안 맞는
        숫자가 잠깐이라도 보이면 그걸 믿고 누른다.
      */}
      <section aria-labelledby={ids.preview} aria-live="polite" aria-busy={calculating} className="rounded-sm bg-[var(--surface)] px-3.5 py-3">
        <h3 id={ids.preview} className="mb-2 text-xs font-semibold">{t('cancel.itemsRefundTitle')}</h3>
        {picked.length === 0 ? (
          <p className="text-xs text-[var(--fg-muted)]">{t('cancel.itemsPick')}</p>
        ) : calculating || !preview ? (
          <p className="text-xs text-[var(--fg-muted)]">{t('cancel.itemsCalculating')}</p>
        ) : (
          <>
            <dl className="flex flex-col gap-1.5 text-[13px]">
              <div className="flex justify-between">
                <dt className="text-[var(--fg-secondary)]">{t('cancel.itemsCash')}</dt>
                <dd className="tnum font-semibold">{money(preview.cash)}</dd>
              </div>
              {preview.points > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-secondary)]">{t('cancel.itemsPoints')}</dt>
                  <dd className="tnum">{formatNumber(locale, preview.points)}P</dd>
                </div>
              )}
              {preview.shippingDeducted > 0 && (
                <div className="flex justify-between">
                  <dt className="text-[var(--fg-secondary)]">{t('cancel.itemsShipping')}</dt>
                  <dd className="tnum">-{money(preview.shippingDeducted)}</dd>
                </div>
              )}
            </dl>
            {preview.shippingDeducted > 0 && (
              <p className="mt-2 text-[11px] leading-relaxed text-[var(--fg-muted)]">{t('cancel.itemsShippingNote')}</p>
            )}
            {preview.kind === 'full' && (
              <p className="mt-2 text-[12px] font-medium text-accent-hover">{t('cancel.itemsFull')}</p>
            )}
          </>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          variant="secondary"
          block
          onClick={() => {
            setOpen(false);
            setPicked([]);
            askPreview([]);
            setError(null);
          }}
          aria-disabled={pending}
        >
          {t('cancel.back')}
        </Button>
        <Button
          type="submit"
          variant="accent"
          block
          aria-disabled={blocked}
          aria-describedby={picked.length === 0 ? ids.pick : undefined}
        >
          {pending ? t('cancel.pending') : t('cancel.itemsSubmit')}
        </Button>
      </div>
      {picked.length === 0 && (
        <p id={ids.pick} className="sr-only">{t('cancel.itemsPick')}</p>
      )}
    </form>
  );
}
