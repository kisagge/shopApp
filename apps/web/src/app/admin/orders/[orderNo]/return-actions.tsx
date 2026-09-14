'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { CARRIERS, format, won } from '@shop/core';
import type { CompleteReturnPreview } from '~/lib/orders/complete-return';

/**
 * 반품 승인·반려.
 *
 * **반려는 사유 없이 못 한다.** 고객이 왜 안 되는지 알아야 다음 행동을
 * 정할 수 있고, 이유 없는 반려는 그대로 문의로 돌아온다.
 *
 * 승인은 돈을 움직이지 않는다. 회수를 기다리는 상태가 될 뿐이고, 환불은
 * order:refund 권한이 따로 있는 동작이다.
 */
export function ReturnActions({ orderNo, exchange = false }: { orderNo: string; exchange?: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: Record<string, unknown>) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? '처리하지 못했습니다.');
        return;
      }
      setRejecting(false);
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  function onReject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('rejectReason');
    const reason = typeof value === 'string' ? value.trim() : '';
    void send({ action: 'REJECT', rejectReason: reason });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      {rejecting ? (
        <form onSubmit={onReject} className="flex flex-col gap-2.5">
          <label htmlFor="rejectReason" className="text-xs font-medium text-[var(--fg-secondary)]">
            반려 사유 <span className="text-accent">*</span>
            <span className="sr-only"> (필수)</span>
          </label>
          <textarea
            id="rejectReason"
            name="rejectReason"
            required
            rows={2}
            maxLength={300}
            placeholder="고객에게 그대로 보입니다."
            className="rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
          />
          <div className="flex gap-2">
            <Button type="submit" size="md" variant="accent" disabled={pending}>
              {pending ? '반려하는 중…' : '반려'}
            </Button>
            <Button
              type="button"
              size="md"
              variant="secondary"
              onClick={() => setRejecting(false)}
              disabled={pending}
            >
              취소
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex gap-2">
          <Button
            type="button"
            size="md"
            disabled={pending}
            onClick={() => send({ action: 'APPROVE' })}
          >
            {pending ? '처리 중…' : exchange ? '교환 승인' : '반품 승인'}
          </Button>
          <Button type="button" size="md" variant="secondary" onClick={() => setRejecting(true)}>
            반려
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * 회수 확인 · 환불.
 *
 * **누르기 전에 얼마가 나가는지 보인다.** 한 줄만 돌려받으면 그 줄의 쿠폰 몫은 빠지고, 단순
 * 변심이면 무료배송 기준 아래로 떨어진 만큼 배송비를 뗀다 — 판매가를 보고 누르면 손님에게
 * 설명할 금액과 달라진다. 주문째 돌려받으면 남은 결제 금액 전부다.
 */
export function CompleteReturnButton({
  orderNo,
  preview,
  received = false,
}: {
  orderNo: string;
  preview: CompleteReturnPreview | null;
  /** 가맹점이 이미 도착을 확인했으면 운영진은 환불만 한다 */
  received?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function complete() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'COMPLETE' }),
      });
      const result = (await response.json()) as { message?: string; refunded?: number };
      if (!response.ok) {
        setError(result.message ?? '환불하지 못했습니다.');
        return;
      }
      setStatus(`${format(won(result.refunded ?? 0))}원을 돌려줬습니다.`);
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        {received
          ? '가맹점이 물건 도착을 확인했습니다. 누르면 재고가 돌아오고 결제가 취소됩니다.'
          : '돌려보낸 물건이 도착했는지 확인한 뒤 누릅니다. 재고가 돌아오고 결제가 취소됩니다.'}
      </p>
      {preview?.kind === 'partial' && (
        <dl className="flex flex-col gap-1 rounded-sm bg-[var(--surface)] px-3.5 py-3 text-[13px]" aria-label="돌려줄 금액">
          <div className="flex justify-between">
            <dt className="text-[var(--fg-secondary)]">결제 수단으로</dt>
            <dd className="tnum font-semibold">{format(preview.cash)}원</dd>
          </div>
          {preview.points > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--fg-secondary)]">포인트로</dt>
              <dd className="tnum">{format(preview.points)}P</dd>
            </div>
          )}
          {preview.shippingDeducted > 0 && (
            <div className="flex justify-between">
              <dt className="text-[var(--fg-secondary)]">배송비 차감 (단순 변심)</dt>
              <dd className="tnum">-{format(preview.shippingDeducted)}원</dd>
            </div>
          )}
        </dl>
      )}
      {preview?.kind === 'full' && (
        <p className="text-[13px] text-[var(--fg-secondary)]">주문의 남은 상품을 전부 돌려받습니다. 남은 결제 금액 전부를 환불합니다.</p>
      )}
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
      <div>
        <Button type="button" size="md" variant="accent" onClick={() => void complete()} aria-disabled={pending}>
          {pending ? '환불하는 중…' : received ? '환불' : '회수 확인 · 환불'}
        </Button>
      </div>
    </div>
  );
}

/**
 * 반품 회수 확인 — 가맹점.
 *
 * **돈은 움직이지 않는다.** 물건이 창고에 도착했다고 적을 뿐이고, 운영진이 이 기록을 보고 환불한다.
 * 도착하지 않은 물건의 값을 치르지 않게, 확인하는 사람이 물건 곁에 있는 사람이다.
 */
export function ReceiveReturnButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function receive() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'RECEIVE' }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? '확인하지 못했습니다.');
        return;
      }
      setStatus('도착을 확인했습니다. 운영진이 환불을 진행합니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4">
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        돌려보낸 물건이 창고에 도착하면 누릅니다. 환불은 운영진이 이 확인을 보고 진행합니다.
      </p>
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}
      <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
      <div>
        <Button type="button" size="md" onClick={() => void receive()} aria-disabled={pending}>
          {pending ? '확인하는 중…' : '물건 도착 확인'}
        </Button>
      </div>
    </div>
  );
}

/**
 * 교환 — 회수 확인 · 교환 상품 발송.
 *
 * **돈은 움직이지 않는다.** 그래서 가맹점도 누른다 — 돌아온 물건을 받고 새 물건을 내보내는 곳이 가맹점 창고다. 바꿀
 * 옵션의 재고는 신청할 때 이미 잡혀 있어, 여기서는 송장만 적는다. 반품의 "환불" 단추는 교환에 뜨지 않는다.
 */
export function ShipExchangeForm({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => {
      const v = data.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };
    setPending(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/orders/${orderNo}/return`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'SHIP_EXCHANGE', carrier: value('carrier'), trackingNumber: value('trackingNumber') }),
      });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(result.message ?? '교환 상품을 보내지 못했습니다.');
        return;
      }
      setStatus('회수를 확인하고 교환 상품 송장을 등록했습니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => onSubmit(e)}
      aria-labelledby="ship-exchange-title"
      className="mt-4 flex flex-col gap-3 border-t border-[var(--border)] pt-4"
    >
      <h3 id="ship-exchange-title" className="text-[13px] font-semibold">교환 상품 발송</h3>
      <p className="text-xs leading-relaxed text-[var(--fg-muted)]">
        돌려보낸 물건이 도착했는지 확인한 뒤 바꾼 옵션을 보내고 송장을 적습니다. 돌아온 옵션의 재고가 늘고, 결제는 그대로입니다.
      </p>
      {error && <p role="alert" className="text-[13px] text-accent">{error}</p>}
      <p aria-live="polite" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="exchange-carrier" className="text-xs font-medium text-[var(--fg-secondary)]">택배사</label>
        <select
          id="exchange-carrier"
          name="carrier"
          defaultValue="CJ"
          className="h-11 rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
        >
          {CARRIERS.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>
      <Field label="교환 송장번호" name="trackingNumber" required inputMode="numeric" maxLength={40} hint="하이픈은 넣어도 됩니다" />
      <div>
        <Button type="submit" size="md" disabled={pending}>
          {pending ? '보내는 중…' : '회수 확인 · 교환 상품 발송'}
        </Button>
      </div>
    </form>
  );
}
