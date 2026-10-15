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

  /**
   * **무료 기준은 기본료보다 커야 한다.**
   *
   * 계약이 이미 막고 있고(`updateShippingPolicySchema`), 까닭도 거기 적혀 있다 — "3,000원짜리
   * 배송비에 무료 기준이 2,000원이면 사실상 언제나 무료인데, 화면에는 '2,000원 이상 무료배송'
   * 이라고 적힌다. 읽는 사람은 조건이 있는 줄 안다."
   *
   * 그런데 **화면은 눌러 본 뒤에야 알려 줬다.** 이 저장소는 반대로 한다 — 서버도 막지만
   * 눌러 보고 나서 알게 하지 않는다.
   */
  const tooLow = free.trim() !== '' && Number(free) <= Number(base);

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
      const data = (await response.json().catch(() => ({}))) as { message?: string };

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

      {/*
        **'0 은 언제나 무료' 라고 적어 두었는데 서버는 그것을 언제나 거절한다.**

        계약이 "무료 기준 > 기본료" 를 요구하므로 0 은 기본료가 무엇이든 통과하지 못한다
        (기본료도 0 이면 `0 > 0` 이 거짓이다). 적어 둔 말이 할 수 없는 일을 가리키고 있었다.
        언제나 무료로 하려면 기본 배송비를 0 으로 적는 것이 그 길이다.
      */}
      <Field
        label="무료배송 기준"
        type="number"
        min={0}
        value={free}
        onChange={(e) => setFree(e.target.value)}
        error={tooLow ? '기본 배송비보다 큰 금액이어야 합니다.' : undefined}
        hint="비워 두면 무료배송을 하지 않습니다. 언제나 무료로 하려면 기본 배송비를 0 으로 적습니다."
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
        <Button type="submit" size="md" disabled={pending || tooLow}>
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
