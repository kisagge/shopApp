'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 구매확정.
 *
 * **되돌릴 수 없어 한 번 더 묻는다** — 그리고 무엇이 달라지는지 그 자리에서 말한다: 적립이 바로 들어오고, 단순 변심
 * 반품이 닫힌다(불량·오배송은 남는다). 모르고 누르면 사이즈를 바꾸려던 사람이 반품 창구를 잃는다.
 *
 * 끝나면 결과를 주소에 싣고 화면을 다시 받는다 — 확정되면 이 단추가 사라지므로, 단추 옆 안내는 읽기도 전에 없어진다
 * (리뷰 등록과 같은 이유). 주문 화면이 주소를 보고 결과를 남긴다.
 */
export function ConfirmPurchaseButton({ orderNo, points }: { orderNo: string; points: string }) {
  const t = useT();
  const router = useRouter();
  const noteId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(orderNo)}/purchase-confirm`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(body.message ?? t('purchase.failed'));
        return;
      }
      router.replace(`/order/${encodeURIComponent(orderNo)}?confirmed=1`, { scroll: false });
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (!confirming) {
    return (
      <Button type="button" variant="secondary" size="md" onClick={() => setConfirming(true)}>
        {t('purchase.confirm')}
      </Button>
    );
  }

  return (
    <div role="group" aria-labelledby={`${noteId}-title`} className="flex flex-col gap-3 rounded-sm border border-[var(--border)] p-4">
      <p id={`${noteId}-title`} className="text-sm font-semibold">{t('purchase.confirm')}</p>
      <p id={noteId} className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        {t('purchase.confirmNote', { points })}
      </p>
      {error && <p role="alert" className="text-[13px] text-accent">{error}</p>}
      <div className="flex gap-2">
        <Button type="button" size="md" onClick={() => void confirm()} disabled={pending} aria-describedby={noteId}>
          {pending ? t('purchase.confirming') : t('purchase.confirmDo')}
        </Button>
        <Button type="button" variant="secondary" size="md" onClick={() => setConfirming(false)} disabled={pending}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
