'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 주문 취소.
 *
 * 되돌릴 수 없는 동작이라 한 번 더 묻는다. 사유를 필수로 받는 이유는
 * 감사 로그에 남기기 위해서다 — 나중에 "왜 취소됐지" 를 답할 수 있어야 한다.
 */
export function CancelOrderButton({ orderNo }: { orderNo: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState(t('cancel.defaultReason'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function cancel() {
    setError(null);
    setPending(true);
    const res = await fetch(`/api/orders/${orderNo}/cancel`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reason: reason.trim() || t('cancel.defaultReason') }),
    });
    setPending(false);

    if (!res.ok) {
      const body = (await res.json()) as { message?: string };
      setError(body.message ?? t('cancel.failed'));
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="danger" block onClick={() => setConfirming(true)}>
          {t('cancel.button')}
        </Button>
        {error && (
          <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-accent p-4">
      <p className="text-[13px] font-semibold">{t('cancel.confirm')}</p>
      <p className="text-xs leading-relaxed text-[var(--fg-secondary)]">
        {t('cancel.note')}
      </p>
      <label htmlFor="cancel-reason" className="text-xs font-medium">
        {t('cancel.reason')}
      </label>
      <input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        className="h-11 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-[13px]"
      />
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {/*
          **왜 못 누르는지 말한다.** 취소를 보내는 동안 이 버튼도 잠기는데,
          옆의 버튼은 이름이 '취소 중…' 으로 바뀌어 스스로 설명하는 반면
          이쪽은 '돌아가기' 그대로다. 낭독기에는 "돌아가기, 사용 불가" 만
          들리고 왜인지는 어디에도 없었다.
        */}
        <Button
          variant="secondary"
          block
          onClick={() => setConfirming(false)}
          aria-disabled={pending}
          aria-describedby={pending ? 'cancel-busy' : undefined}
        >
          {t('cancel.back')}
        </Button>
        <Button variant="accent" block onClick={() => cancel()} aria-disabled={pending}>
          {pending ? t('cancel.pending') : t('cancel.button')}
        </Button>
      </div>
      {pending && (
        <p id="cancel-busy" className="sr-only">
          {t('common.busyWait')}
        </p>
      )}
    </div>
  );
}
