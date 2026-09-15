'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 보관함에서 되돌리기.
 *
 * 한 번에 된다 — 되돌리는 것은 보관 전 상태로 돌아갈 뿐이고, 잘못 눌렀으면 다시 보관하면 된다.
 * 되돌리면 이 줄이 보관함에서 사라지므로 결과는 주소에 실어 목록 위에서 말한다.
 */
export function RestoreProductButton({ productId, productName }: { productId: string; productName: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/archive`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'RESTORE' }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '되돌리지 못했습니다.'));
        return;
      }
      router.replace('/admin/products?view=archived&restored=1');
      // 이미 같은 주소에 있으면 replace 만으로는 목록을 다시 읽지 않는다
      router.refresh();
    } catch {
      setError('네트워크 오류로 되돌리지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => void restore()}
        disabled={pending}
        aria-label={`${productName} 되돌리기`}
        className="h-8 rounded-sm border border-[var(--border-strong)] px-3 text-[12px] text-[var(--fg)] disabled:opacity-60"
      >
        {pending ? '되돌리는 중…' : '되돌리기'}
      </button>
      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </div>
  );
}
