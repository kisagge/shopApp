'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { CARRIERS, carrierOf, formatTrackingNumber } from '@shop/core';

/** 보내려는 송장 한 벌 */
interface Shipment {
  readonly carrier: string;
  readonly trackingNumber: string;
}

/**
 * 송장 등록.
 *
 * 등록하면 배송중으로 함께 넘어간다. 나눠 두면 송장 없이 배송중인 주문이
 * 생기고, 고객은 "배송중" 이라는 글자만 보면서 어디쯤인지 물어볼 곳이 없다.
 *
 * **배송지가 바뀐 주문에서는 한 번 더 묻는다.** 이 단추를 누르는 순간 물건이 그 주소로 떠난다 —
 * 목록의 표시와 위의 안내를 지나쳐 왔다면 여기가 마지막 문이다. 되돌릴 수 없는 일이라(오배송),
 * 구매확정·반품 승인과 같은 결로 한 번 더 세운다.
 */
export function ShipmentForm({
  orderNo,
  current,
  addressChangedAt,
}: {
  orderNo: string;
  current: { carrier: string | null; trackingNumber: string | null } | null;
  /** 배송지가 바뀐 시각. **서버가 다듬은 글자**다 — 화면이 다시 재면 서버가 적은 시각과 갈린다 */
  addressChangedAt?: string | undefined;
}) {
  const router = useRouter();
  const noteId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  /** 물어보는 중이라면 무엇을 등록하려던 것인지 — 확인 화면이 그 값을 그대로 보여 준다 */
  const [asking, setAsking] = useState<Shipment | null>(null);

  const registered = current?.trackingNumber != null;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const data = new FormData(event.currentTarget);
    const value = (key: string) => {
      const v = data.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };
    const shipment = { carrier: value('carrier'), trackingNumber: value('trackingNumber') };

    // 주소가 바뀐 주문이면 보내기 전에 한 번 더 — 지나쳐 왔을 수 있다
    if (addressChangedAt !== undefined) {
      setError(null);
      setStatus('');
      setAsking(shipment);
      return;
    }
    void send(shipment);
  }

  async function send(shipment: Shipment) {
    setPending(true);
    setError(null);
    setStatus('');

    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/shipment`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(shipment),
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
      setAsking(null);
      router.refresh();
    } catch {
      setError('네트워크 오류로 등록하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-3">
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

      {/*
        **마지막 문.** 누르면 물건이 그 주소로 떠난다. 주소가 바뀐 주문이면 무엇을 붙이려는지 되읽어
        주고 한 번 더 세운다 — 목록의 표시와 위의 안내를 지나쳐 왔을 수 있고, 오배송은 되돌릴 수 없다.
      */}
      {asking === null ? (
        <Button type="submit" disabled={pending}>
          {pending ? '등록하는 중…' : registered ? '송장 수정' : '송장 등록하고 배송 시작'}
        </Button>
      ) : (
        <div
          role="group"
          aria-labelledby={`${noteId}-title`}
          className="flex flex-col gap-3 rounded-sm border border-accent bg-accent-soft p-3.5"
        >
          <p id={`${noteId}-title`} className="text-[13px] font-semibold text-accent-hover">
            배송지가 바뀐 주문입니다
          </p>
          <p id={noteId} className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
            이 주문의 배송지는 {addressChangedAt} 에 바뀌었습니다. 위의 주소로 붙였는지 확인한 뒤
            등록하세요 — 등록하면 {carrierOf(asking.carrier)?.name ?? asking.carrier}{' '}
            <span className="tnum">{formatTrackingNumber(asking.trackingNumber)}</span> 으로 배송이 시작됩니다.
          </p>
          <div className="flex gap-2">
            <Button type="button" size="md" onClick={() => void send(asking)} disabled={pending} aria-describedby={noteId}>
              {pending ? '등록하는 중…' : '주소를 확인했습니다 — 등록'}
            </Button>
            <Button type="button" variant="secondary" size="md" onClick={() => setAsking(null)} disabled={pending}>
              취소
            </Button>
          </div>
        </div>
      )}
      {registered && (
        <p className="text-[12px] text-[var(--fg-muted)]">
          이미 등록된 송장이 있습니다. 다시 저장하면 덮어씁니다.
        </p>
      )}
    </form>
  );
}
