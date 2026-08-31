'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/** 대사 실행. 원장 합계로 잔액을 덮어쓴다. */
export function ReconcileButton({ mismatchCount }: { mismatchCount: number }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/points/reconcile', { method: 'POST' });
      const data = (await response.json()) as { message?: string; fixed?: number };
      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? '대사를 실행하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: `${data.fixed ?? 0}건의 잔액을 원장에 맞췄습니다.` });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '네트워크 오류로 실행하지 못했습니다.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" size="md" variant="secondary" disabled={pending || mismatchCount === 0} onClick={run}>
        {pending ? '대사 중…' : '원장에 맞추기'}
      </Button>
      {message && (
        <p role="status" className={`text-[12px] ${message.tone === 'ok' ? 'text-success' : 'text-accent'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
