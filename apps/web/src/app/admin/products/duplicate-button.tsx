'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 상품 복제.
 *
 * **무엇이 따라가고 무엇이 안 따라가는지 누르기 전에 말한다** — 재고가 0 이고 임시저장으로 만들어진다는 것을 모르고
 * 누르면, 사본이 매대에 안 뜨는 것을 고장으로 읽는다. 한 번 더 누르게 한다: 잘못 눌러 생긴 사본은 지우는 길이 없다.
 * 만들어지면 곧바로 사본 화면으로 간다 — 고치러 복제한 것이다.
 */
export function DuplicateProductButton({ productId }: { productId: string }) {
  const router = useRouter();
  const noteId = useId();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/duplicate`, { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!response.ok || !body.id) {
        setError(body.message ?? '복제하지 못했습니다.');
        return;
      }
      router.push(`/admin/products/${body.id}`);
    } catch {
      setError('네트워크 오류로 복제하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {confirming ? (
        <>
          <p id={noteId} className="text-[12px] text-[var(--fg-secondary)]">
            옵션·가격·사진을 복사해 <b>임시저장</b> 상품을 만듭니다. 재고는 0, 리뷰·판매량은 따라가지 않습니다.
          </p>
          <button
            type="button"
            onClick={() => void duplicate()}
            disabled={pending}
            aria-describedby={noteId}
            className="h-9 rounded-sm bg-[var(--brand)] px-3 text-[13px] font-medium text-[var(--bg)] disabled:opacity-60"
          >
            {pending ? '복제하는 중…' : '사본 만들기'}
          </button>
          <button type="button" onClick={() => setConfirming(false)} disabled={pending} className="h-9 px-2 text-[13px] text-[var(--fg-secondary)]">
            취소
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="h-9 rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)]"
        >
          복제
        </button>
      )}
      {error && <p role="alert" className="w-full text-[12px] text-accent">{error}</p>}
    </div>
  );
}
