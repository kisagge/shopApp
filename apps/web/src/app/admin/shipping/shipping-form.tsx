'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';

/**
 * 배송비 정책 폼.
 *
 * **빈 칸과 0 은 다른 뜻이다.** 무료 기준을 비워 두면 "무료배송 없음" 이고,
 * 0 을 적으면 "언제나 무료" 다. 숫자 칸 하나로 두 뜻을 표현해야 해서, 빈
 * 문자열을 null 로 보내고 그 사실을 칸 아래에 적어 둔다.
 */
export function ShippingPolicyForm({
  baseFee,
  freeThreshold,
  remoteSurcharge,
}: {
  baseFee: number;
  freeThreshold: number | null;
  remoteSurcharge: number;
}) {
  const router = useRouter();
  const [base, setBase] = useState(String(baseFee));
  const [free, setFree] = useState(freeThreshold === null ? '' : String(freeThreshold));
  const [remote, setRemote] = useState(String(remoteSurcharge));
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setPending(true);
    setMessage(null);

    try {
      const response = await fetch('/api/admin/shipping', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseFee: Number(base),
          // 빈 칸은 "무료배송 없음" 이다 — 0 과 다르다
          freeThreshold: free.trim() === '' ? null : Number(free),
          remoteSurcharge: Number(remote),
        }),
      });
      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? '저장하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: '저장했습니다. 지금부터 이 값으로 계산합니다.' });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '네트워크 오류로 저장하지 못했습니다.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field
        label="기본 배송비"
        type="number"
        min={0}
        required
        value={base}
        onChange={(e) => setBase(e.target.value)}
        hint="원 단위로 적습니다."
      />

      <Field
        label="무료배송 기준"
        type="number"
        min={0}
        value={free}
        onChange={(e) => setFree(e.target.value)}
        hint="비워 두면 무료배송을 하지 않습니다. 0 은 '언제나 무료' 라는 뜻입니다."
      />

      <Field
        label="제주·도서산간 추가 배송비"
        type="number"
        min={0}
        required
        value={remote}
        onChange={(e) => setRemote(e.target.value)}
      />

      <div className="flex items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? '저장 중…' : '저장'}
        </Button>
        {message && (
          <p
            {...(message.tone === 'error' ? { role: 'alert' as const } : { role: 'status' as const })}
            className={`text-[12px] ${message.tone === 'ok' ? 'text-success' : 'text-accent'}`}
          >
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
