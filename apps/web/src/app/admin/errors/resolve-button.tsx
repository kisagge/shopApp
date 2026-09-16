'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/**
 * 오류 하나를 처리했다고 표시하거나 되돌린다.
 *
 * 지우는 단추가 아니다 — 기록은 남고, 그 뒤에 또 나면 스스로 다시 열린다.
 */
export function ResolveButton({
  fingerprint,
  resolved,
}: {
  fingerprint: string;
  resolved: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/admin/errors/${encodeURIComponent(fingerprint)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resolved: !resolved }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { message?: string };
        setFailure(body.message ?? '바꾸지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setFailure('네트워크 오류로 바꾸지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (failure) return <span role="alert" className="text-[11px] text-accent">{failure}</span>;

  return (
    <Button
      type="button"
      size="sm"
      variant={resolved ? 'secondary' : 'primary'}
      disabled={pending}
      onClick={() => void toggle()}
    >
      {pending ? '보내는 중…' : resolved ? '다시 열기' : '처리함'}
    </Button>
  );
}
