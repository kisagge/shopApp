'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/** 기간 확정. 여러 번 눌러도 결과가 같지만, 되돌리기 어려운 일이라 한 번 묻는다. */
export function CloseButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirming' | 'pending'>('idle');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function close() {
    setState('pending');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/settlements/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yearMonth }),
      });
      const data = (await response.json()) as {
        message?: string; created?: number; updated?: number; skipped?: string[];
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? '확정하지 못했습니다.' });
        return;
      }
      const skipped = data.skipped?.length
        ? ` 이미 확정·지급된 ${data.skipped.length}건은 건드리지 않았습니다.`
        : '';
      setMessage({
        tone: 'ok',
        text: `${yearMonth} 정산을 확정했습니다 — 신규 ${data.created ?? 0}건, 재계산 ${data.updated ?? 0}건.${skipped}`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '네트워크 오류로 확정하지 못했습니다.' });
    } finally {
      setState('idle');
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {state === 'confirming' ? (
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-[var(--fg-secondary)]">
            {yearMonth} 정산을 확정합니다. 확정 후에는 금액이 다시 계산되지 않습니다.
          </p>
          <Button type="button" size="sm" onClick={() => close()}>확정</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setState('idle')}>
            취소
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="md"
          variant="secondary"
          disabled={state === 'pending'}
          onClick={() => setState('confirming')}
        >
          {state === 'pending' ? '확정 중…' : `${yearMonth} 정산 확정`}
        </Button>
      )}

      {message && (
        <p
          role="status"
          className={`text-[12px] ${message.tone === 'ok' ? 'text-success' : 'text-accent'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** 지급 집행. 돈이 실제로 나가므로 확정과 다른 사람이 누른다. */
export function PayButton({
  settlementId,
  merchantName,
  disabledReason,
}: {
  settlementId: string;
  merchantName: string;
  disabledReason?: string | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) {
    return <span className="text-[11px] text-[var(--fg-muted)]">{disabledReason}</span>;
  }

  async function pay() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/settlements/${settlementId}/pay`, { method: 'POST' });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '지급 처리하지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 지급 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => pay()}>
        <span className="sr-only">{merchantName} </span>
        {pending ? '처리 중…' : '지급'}
      </Button>
      {error && <p role="alert" className="mt-1 text-[11px] text-accent">{error}</p>}
    </>
  );
}
