'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/** 목록에서 알림 하나를 지운다 */
export function RestockRow({
  variantId,
  productName,
}: {
  variantId: string;
  productName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');

  async function remove() {
    setPending(true);
    try {
      const response = await fetch(`/api/restock/${variantId}`, { method: 'DELETE' });
      if (!response.ok) {
        setStatus('지우지 못했습니다.');
        return;
      }
      setStatus(`${productName} 알림을 지웠습니다.`);
      router.refresh();
    } catch {
      setStatus('네트워크 오류로 지우지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {/* 목록에서 한 줄이 사라지는 것은 눈으로만 보이는 변화다 */}
      <p aria-live="polite" className="sr-only">{status}</p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        // "삭제" 만 있으면 스크린리더로는 어느 줄의 삭제인지 알 수 없다
        aria-label={`${productName} 재입고 알림 삭제`}
        onClick={() => void remove()}
      >
        삭제
      </Button>
    </>
  );
}
