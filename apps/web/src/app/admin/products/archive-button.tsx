'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 상품 보관.
 *
 * **누르기 전에 무엇이 멈추고 무엇이 남는지 말한다.** 보관은 새로 파는 것을 멈출 뿐이다 — 이미 받은 주문은 보내야 하고,
 * 그런 주문이 몇 건 남았는지 함께 말한다. 모르고 누르면 "보관했으니 끝났다" 로 읽는다.
 *
 * 한 번 더 누르게 한다. 되돌릴 수 있지만, 그 사이 매대에서 빠진 상품을 손님이 못 사고 장바구니에서 막힌다.
 * 보관하면 이 화면이 사라지므로(보관한 상품은 수정 화면이 없다) 보관함으로 가서 결과를 말한다.
 */
export function ArchiveProductButton({ productId, unshipped }: { productId: string; unshipped: number }) {
  const router = useRouter();
  const noteId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 확인 단계로 넘어가면 초점을 확인 단추로 — 누른 단추가 사라져 초점이 문서 맨 앞으로 튀지 않게
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  async function archive() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/archive`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'ARCHIVE' }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '보관하지 못했습니다.'));
        return;
      }
      router.replace('/admin/products?view=archived&archived=1');
    } catch {
      setError('네트워크 오류로 보관하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <div role="group" aria-label="상품 보관" className="flex flex-wrap items-center gap-2">
          <p id={noteId} className="text-[12px] text-[var(--fg-secondary)]">
            매대·검색에서 빠지고, 장바구니에 담긴 것은 주문할 수 없게 됩니다. 지난 주문·리뷰는 그대로 남고 보관함에서
            되돌릴 수 있습니다.
            {unshipped > 0 && (
              <b className="block text-warning">아직 보내지 않은 주문 {unshipped}건은 보관해도 보내야 합니다.</b>
            )}
          </p>
          <button
            ref={confirmRef}
            type="button"
            onClick={() => void archive()}
            disabled={pending}
            aria-describedby={noteId}
            className="h-9 rounded-sm bg-accent px-3 text-[13px] font-medium text-[var(--bg)] disabled:opacity-60"
          >
            {pending ? '보관하는 중…' : '보관하기'}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="h-9 px-2 text-[13px] text-[var(--fg-secondary)]"
          >
            취소
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-9 rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)]"
        >
          보관
        </button>
      )}
      {error && <p role="alert" className="w-full text-[12px] text-accent">{error}</p>}
    </div>
  );
}
