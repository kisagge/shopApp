'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 상품 신고 처리 단추.
 *
 * **"문제없음" 은 바로 누르고, "내리기" 는 한 번 더 묻는다.** 내리는 쪽은 남의 매출을
 * 멈추는 일이고 옆자리 단추와 한 뼘 거리다 — 손이 미끄러지기 좋은 줄이다. 되돌리는 길은
 * 있지만(보관 되돌리기) 그 사이 상품은 매대에서 사라진다.
 */
export function ReportActions({
  productId,
  productName,
}: {
  productId: string;
  productName: string;
}) {
  const router = useRouter();
  const panelId = useId();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 묻는 판이 열리면 단추가 사라진다 — 열면 판으로, 닫으면 단추로 초점을 옮긴다
  const { triggerRef, panelRef } = useDisclosureFocus<HTMLDivElement>(asking);

  async function send(resolution: 'kept' | 'archived') {
    // 보내는 중에 다시 눌리면 같은 처리가 두 번 나간다
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/product-reports/${productId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolution }),
      });
      // ok 를 보고 나서 본문을 읽는다 — 502 가 HTML 이면 읽는 줄이 던진다
      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return;
      }
      setAsking(false);
      router.refresh();
    } catch {
      setError('처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (asking) {
    return (
      <div
        id={panelId}
        ref={panelRef}
        /* 초점을 받되 탭 순서에는 넣지 않는다 — 열릴 때 옮겨 줄 뿐이다 */
        tabIndex={-1}
        role="group"
        aria-label={`${productName} 보관할까요?`}
        className="flex flex-col items-end gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
      >
        <p className="text-[12px] text-[var(--fg-secondary)]">
          매대에서 내립니다. 되돌릴 수 있습니다.
        </p>
        <div className="flex gap-1.5">
          <Button variant="accent" onClick={() => void send('archived')} aria-disabled={pending}>
            {pending ? '처리 중…' : '내리기'}
          </Button>
          <Button variant="secondary" onClick={() => setAsking(false)}>
            그만
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-[12px] text-accent-hover">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex gap-1.5">
        <Button variant="secondary" onClick={() => void send('kept')} aria-disabled={pending}>
          {pending ? '처리 중…' : '문제없음'}
        </Button>
        <Button
          ref={triggerRef}
          variant="secondary"
          onClick={() => setAsking(true)}
          aria-expanded={false}
          aria-controls={panelId}
        >
          내리기
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-[12px] text-accent-hover">
          {error}
        </p>
      )}
    </div>
  );
}
