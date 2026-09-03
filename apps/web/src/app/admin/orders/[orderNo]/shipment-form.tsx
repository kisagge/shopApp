'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { CARRIERS, formatTrackingNumber } from '@shop/core';

/**
 * 송장 등록.
 *
 * 등록하면 배송중으로 함께 넘어간다. 나눠 두면 송장 없이 배송중인 주문이
 * 생기고, 고객은 "배송중" 이라는 글자만 보면서 어디쯤인지 물어볼 곳이 없다.
 */
export function ShipmentForm({
  orderNo,
  current,
}: {
  orderNo: string;
  current: { carrier: string | null; trackingNumber: string | null } | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const registered = current?.trackingNumber != null;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setStatus('');

    const data = new FormData(event.currentTarget);
    const value = (key: string) => {
      const v = data.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };

    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/shipment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ carrier: value('carrier'), trackingNumber: value('trackingNumber') }),
      });
      const result = (await response.json()) as {
        message?: string;
        waitingForOthers?: boolean;
      };
      if (!response.ok) {
        setError(result.message ?? '송장을 등록하지 못했습니다.');
        return;
      }
      setStatus(
        result.waitingForOthers
          ? '송장을 등록했습니다. 다른 가맹점 상품이 남아 주문 전체는 아직 배송중이 아닙니다.'
          : '송장을 등록하고 배송중으로 옮겼습니다.',
      );
      router.refresh();
    } catch {
      setError('네트워크 오류로 등록하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
      {/* 결과를 소리로도 알린다. 화면은 refresh 로 조용히 바뀐다. */}
      <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">
        {status}
      </p>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="carrier" className="text-xs font-medium text-[var(--fg-secondary)]">
          택배사
        </label>
        <select
          id="carrier"
          name="carrier"
          defaultValue={current?.carrier ?? 'CJ'}
          className="h-11 rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
        >
          {CARRIERS.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <Field
        label="송장번호"
        name="trackingNumber"
        required
        inputMode="numeric"
        maxLength={40}
        hint="하이픈은 넣어도 됩니다"
        defaultValue={
          current?.trackingNumber ? formatTrackingNumber(current.trackingNumber) : ''
        }
      />

      <Button type="submit" disabled={pending}>
        {pending ? '등록하는 중…' : registered ? '송장 수정' : '송장 등록하고 배송 시작'}
      </Button>
      {registered && (
        <p className="text-[12px] text-[var(--fg-muted)]">
          이미 등록된 송장이 있습니다. 다시 저장하면 덮어씁니다.
        </p>
      )}
    </form>
  );
}
