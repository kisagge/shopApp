'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import {
  MERCHANT_STATUS, MERCHANT_STATUS_LABEL, type MerchantStatusInput,
} from '@shop/contract';

/**
 * 입점 상태 변경.
 *
 * 승인은 버튼 하나로 끝내고, **불이익 처분에는 사유 입력을 강제한다.**
 * 계약에서도 막지만 화면에서 미리 알려 줘야 제출하고 나서 튕기지 않는다.
 */
export function MerchantStatusForm({
  merchantId,
  merchantName,
  status,
}: {
  merchantId: string;
  merchantName: string;
  status: MerchantStatusInput;
}) {
  const router = useRouter();
  const [next, setNext] = useState<MerchantStatusInput>(status);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const statusId = useId();
  const reasonId = useId();
  const needsReason = next === 'SUSPENDED' || next === 'TERMINATED';

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/merchants/${merchantId}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: next, reason }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '상태를 바꾸지 못했습니다.');
        return;
      }
      setReason('');
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label htmlFor={statusId} className="sr-only">
        {merchantName} 입점 상태
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id={statusId}
          value={next}
          onChange={(e) => setNext(e.target.value as MerchantStatusInput)}
          className="h-9 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
        >
          {MERCHANT_STATUS.map((s) => (
            <option key={s} value={s}>{MERCHANT_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="secondary" disabled={pending || next === status}>
          {pending ? '적용 중…' : '적용'}
        </Button>
      </div>

      {needsReason && (
        <>
          <label htmlFor={reasonId} className="text-[11px] text-[var(--fg-secondary)]">
            사유 (필수)
          </label>
          <input
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={300}
            required
            className="h-9 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
          />
        </>
      )}

      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
