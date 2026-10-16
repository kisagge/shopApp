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

  /*
   * **실패하면 단추가 사라지고 있었다.**
   *
   * 까닭을 적는 것까지는 맞는데, 단추 **대신** 적었다. 망이 한 번 끊기면 그 줄의 단추가
   * 통째로 없어져 다시 눌러 볼 수도, 그 말을 치울 수도 없다 — 화면을 새로 받기 전까지.
   * 까닭은 곁에 적고 단추는 그 자리에 둔다. 다시 누르면 지난 말은 사라진다.
   */
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={resolved ? 'secondary' : 'primary'}
        disabled={pending}
        onClick={() => void toggle()}
      >
        {pending ? '보내는 중…' : resolved ? '다시 열기' : '처리함'}
      </Button>
      {failure && <span role="alert" className="text-[11px] text-accent">{failure}</span>}
    </span>
  );
}
