'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 손님이 자기 반품·교환 신청을 무른다.
 *
 * **들어가면 나올 문이 없었다.** 신청하는 자리는 있는데 무르는 자리가 운영진 쪽에만 있어서, 줄을 잘못
 * 골랐거나 마음이 바뀌면 주문이 반품접수에 갇혔다 — 구매확정도 자동 확정도 안 되고(적립금이 안 나오고
 * 후기도 못 쓴다), 내용을 고쳐 다시 낼 수도 없었다.
 *
 * 한 번 더 묻는다. 무르면 그 신청은 끝나고, 다시 신청하려면 처음부터 골라야 한다.
 *
 * 실패는 **눈에도 보이게** 적는다 — 낭독기에만 들리면, 보고 있는 사람에게는 눌렀는데 아무 일도 안
 * 일어난 것이 된다.
 */
export function CancelReturnButton({ orderNo, type }: { orderNo: string; type: 'RETURN' | 'EXCHANGE' }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel(): Promise<void> {
    // 단추는 aria-disabled 만 걸리므로(초점을 받아야 이유가 들린다) 두 번 누르는 것은 여기서 막는다
    if (pending) return;
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/orders/${orderNo}/return`, { method: 'DELETE' });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? t('retCancel.failed'));
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError(t('retCancel.failed'));
    } finally {
      setPending(false);
    }
  }

  const what = t(type === 'EXCHANGE' ? 'retCancel.exchange' : 'retCancel.return');

  if (!confirming) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
          {t('retCancel.button', { what })}
        </Button>
        {error && (
          <p role="alert" className="text-[12px] text-accent">{error}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-sm border border-[var(--border-strong)] p-3.5">
      <p className="text-[13px] font-semibold">{t('retCancel.confirm', { what })}</p>
      <p className="text-[12px] leading-relaxed text-[var(--fg-secondary)]">{t('retCancel.note')}</p>
      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void cancel()}
          aria-disabled={pending}
        >
          {t(pending ? 'retCancel.pending' : 'retCancel.yes')}
        </Button>
        {/* 되돌아가는 길은 잠기지 않는다 — 보내는 중에도 마음을 바꿀 수 있어야 한다 */}
        <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
          {t('retCancel.back')}
        </Button>
      </div>
    </div>
  );
}
