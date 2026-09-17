'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/**
 * 취소한 주문에 들어온 입금을 **돌려준 뒤** 닫는 단추.
 *
 * 누르는 것이 곧 환불이 아니다 — 입금 뒤 환불은 손님 계좌가 있어야 해서 사람이 따로 보낸다.
 * 그래서 단추 이름과 설명이 "돌려주었다" 를 말하고, 한 번 더 묻는다. 잘못 누르면 받은 돈이
 * 목록에서 사라지고 아무도 돌려주지 않는다.
 */
export function LateDepositButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resolve() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/late-deposit`, { method: 'POST' });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? '처리하지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {asking ? (
        <div role="group" aria-label="환불 처리 확인" className="flex flex-wrap items-center gap-2">
          <p className="text-[12px]">손님에게 돌려주었습니까? 누르면 목록에서 빠집니다.</p>
          <Button type="button" size="sm" aria-disabled={pending} onClick={() => { if (!pending) void resolve(); }}>
            {pending ? '처리 중…' : '돌려주었음'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAsking(false)}>취소</Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="secondary" className="w-fit" onClick={() => setAsking(true)}>
          환불 처리함
        </Button>
      )}
      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
    </div>
  );
}
