'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field, Price } from '@shop/ui';
import { format, won } from '@shop/core';
import {
  PAYMENT_METHOD, LINE_ISSUE_MESSAGE,
  type CreateOrderResponse, type OrderError, type PaymentMethodInput,
} from '@shop/contract';
import { track } from '~/lib/analytics/client';
import { useCartQuote } from '~/lib/use-cart-quote';
import { useCartStore } from '~/stores/cart';
import { getSessionId } from '~/lib/analytics/session';
import { useMemo } from 'react';

const METHOD_LABEL: Record<PaymentMethodInput, string> = {
  CARD: '신용·체크카드',
  TRANSFER: '계좌이체',
  VIRTUAL_ACCOUNT: '가상계좌',
  EASY_PAY: '간편결제',
};

interface SavedAddress {
  id: string; label: string | null; recipient: string; phone: string;
  postalCode: string; address1: string; address2: string | null; isRemoteArea: boolean;
}

export function CheckoutForm({ defaultAddress }: { defaultAddress: SavedAddress | null }) {
  const router = useRouter();
  const items = useCartStore((s) => s.items);
  const selected = useMemo(() => items.filter((i) => i.selected), [items]);

  const [method, setMethod] = useState<PaymentMethodInput>('CARD');
  const [agreed, setAgreed] = useState(false);
  const [memo, setMemo] = useState('');
  const [pointsToUse, setPointsToUse] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const quote = useCartQuote({
    items: selected,
    pointsToUse,
    isRemoteArea: defaultAddress?.isRemoteArea ?? false,
  });

  const q = quote.data;
  const broken = (q?.lines ?? []).filter((l) => l.issue !== null);
  const canOrder =
    !!defaultAddress && agreed && !pending && !!q && q.payable >= 0 && broken.length === 0
    && (q.lines.length > 0);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!defaultAddress) return;
    setError(null);
    setPending(true);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        lines: selected.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        addressId: defaultAddress.id,
        ...(memo.trim() ? { deliveryMemo: memo.trim() } : {}),
        ...(pointsToUse > 0 ? { pointsToUse } : {}),
        paymentMethod: method,
        // 퍼널을 이어 붙이려면 조회·담기와 같은 세션이어야 한다
        browserSessionId: getSessionId(),
        agreedToTerms: true,
      }),
    });

    setPending(false);

    if (!res.ok) {
      const body = (await res.json()) as Partial<OrderError> & { message?: string };
      setError(body.message ?? '주문에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      // 재고 문제면 금액을 다시 받아 화면을 갱신한다
      if (body.code === 'OUT_OF_STOCK') void quote.refetch();
      return;
    }

    const order = (await res.json()) as CreateOrderResponse;
    track('add_payment_info', { method });

    /**
     * 결제 승인.
     *
     * 실제로는 여기서 PG 결제창을 띄우고, 창이 돌려준 paymentKey 로 승인을
     * 요청한다. 아직 결제창을 붙이지 않아 Mock 게이트웨이가 알아보는 키를
     * 만들어 보낸다 — 서버 쪽 승인 흐름(금액 검증·멱등·상태 전이)은 실제와 같다.
     */
    setPending(true);
    const mockKey = `${method === 'VIRTUAL_ACCOUNT' ? 'mock_va' : 'mock'}_${order.orderNo}`;
    const confirmRes = await fetch(`/api/orders/${order.orderNo}/confirm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paymentKey: mockKey, amount: order.payable }),
    });
    setPending(false);

    // 주문에 들어간 항목만 장바구니에서 뺀다
    for (const i of selected) useCartStore.getState().remove(i.variantId);

    if (!confirmRes.ok) {
      // 주문은 만들어졌지만 결제가 실패했다. 주문 화면에서 다시 시도할 수 있다.
      const body = (await confirmRes.json()) as { message?: string };
      setError(`${body.message ?? '결제 승인에 실패했습니다.'} 주문 내역에서 다시 시도할 수 있습니다.`);
      router.push(`/order/${order.orderNo}`);
      return;
    }

    router.push(`/order/${order.orderNo}`);
  }

  if (selected.length === 0) {
    return (
      <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
        주문할 상품이 없습니다. 장바구니에서 상품을 선택해 주세요.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-8" noValidate>
      <section aria-labelledby="addr-title">
        <h2 id="addr-title" className="mb-3.5 text-sm font-semibold">배송지</h2>
        {defaultAddress ? (
          <div className="flex flex-col gap-1.5 rounded-sm border border-[var(--border)] p-4">
            <p className="flex items-center gap-2">
              <span className="text-sm font-semibold">{defaultAddress.recipient}</span>
              {defaultAddress.label && <Badge tone="neutral">{defaultAddress.label}</Badge>}
            </p>
            <p className="tnum text-[13px] text-[var(--fg-secondary)]">{defaultAddress.phone}</p>
            <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
              {defaultAddress.address1} {defaultAddress.address2}{' '}
              <span className="tnum text-[var(--fg-muted)]">({defaultAddress.postalCode})</span>
            </p>
          </div>
        ) : (
          <p role="alert" className="rounded-sm bg-accent-soft px-4 py-3 text-[13px] text-accent-hover">
            등록된 배송지가 없습니다. 배송지를 먼저 등록해 주세요.
          </p>
        )}
        <div className="mt-4">
          <Field
            label="배송 요청사항"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="부재 시 문 앞에 놓아주세요"
            maxLength={100}
          />
        </div>
      </section>

      <section aria-labelledby="items-title">
        <h2 id="items-title" className="mb-3.5 text-sm font-semibold">
          주문 상품 <span className="tnum text-[var(--fg-muted)]">{selected.length}</span>
        </h2>
        <ul className="flex flex-col gap-3">
          {selected.map((i) => {
            const line = q?.lines.find((l) => l.variantId === i.variantId);
            return (
              <li key={i.variantId} className="flex items-center justify-between gap-3">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{i.brand}</span>
                  <span className="text-[13px]">{i.productName}</span>
                  <span className="text-[11px] text-[var(--fg-muted)]">
                    {i.optionLabel} · <span className="tnum">{i.quantity}</span>개
                  </span>
                  {line?.issue && (
                    <span role="status">
                      <Badge tone="danger">{LINE_ISSUE_MESSAGE[line.issue]}</Badge>
                    </span>
                  )}
                </span>
                <span className="tnum text-sm font-semibold">
                  {line ? `${format(won(line.subtotal))}원` : '—'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {q && q.pointsAvailable > 0 && (
        <section aria-labelledby="point-title">
          <h2 id="point-title" className="mb-3.5 text-sm font-semibold">포인트</h2>
          <div className="flex gap-2">
            <Field
              label="사용할 포인트"
              type="number"
              min={0}
              max={q.pointsAvailable}
              value={pointsToUse === 0 ? '' : String(pointsToUse)}
              onChange={(e) => setPointsToUse(Math.max(0, Number(e.target.value) || 0))}
              hint={`보유 ${format(won(q.pointsAvailable))}P · 1,000P부터 사용 가능`}
              className="flex-1"
            />
            <Button
              variant="secondary"
              size="lg"
              className="mt-7 h-12 w-24 shrink-0"
              onClick={() => setPointsToUse(q.pointsAvailable)}
            >
              전액사용
            </Button>
          </div>
        </section>
      )}

      <section aria-labelledby="method-title">
        <h2 id="method-title" className="mb-3.5 text-sm font-semibold">결제 수단</h2>
        <ul role="radiogroup" aria-labelledby="method-title" className="grid grid-cols-2 gap-2">
          {PAYMENT_METHOD.map((m) => (
            <li key={m}>
              <button
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={[
                  'h-12 w-full rounded-sm border text-sm',
                  method === m
                    ? 'border-n-900 bg-n-900 font-medium text-n-0'
                    : 'border-n-300 bg-[var(--bg)]',
                ].join(' ')}
              >
                {METHOD_LABEL[m]}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
          결제 연동은 아직 붙지 않았습니다. 주문은 <strong className="font-semibold">입금대기</strong> 상태로
          생성되고 실제 결제는 발생하지 않습니다.
        </p>
      </section>

      <section aria-labelledby="total-title">
        <h2 id="total-title" className="mb-3.5 text-sm font-semibold">결제 금액</h2>
        {quote.isPending || !q ? (
          <p className="text-[13px] text-[var(--fg-muted)]">계산 중…</p>
        ) : (
          <dl className="flex flex-col gap-2.5">
            <Row label="상품 금액" value={`${format(won(q.listTotal))}원`} />
            {q.productDiscount > 0 && <Row label="상품 할인" value={`-${format(won(q.productDiscount))}원`} accent />}
            {q.couponDiscount > 0 && <Row label="쿠폰 할인" value={`-${format(won(q.couponDiscount))}원`} accent />}
            {q.pointsUsed > 0 && <Row label="포인트 사용" value={`-${format(won(q.pointsUsed))}원`} accent />}
            <Row label="배송비" value={q.shippingFee === 0 ? '무료' : `${format(won(q.shippingFee))}원`} />
            <div className="mt-1 flex items-baseline justify-between border-t border-[var(--border)] pt-3.5">
              <dt className="text-[15px] font-semibold">최종 결제 금액</dt>
              <dd><Price amount={won(q.payable)} size="md" /></dd>
            </div>
          </dl>
        )}
      </section>

      <section aria-labelledby="agree-title">
        <h2 id="agree-title" className="sr-only">약관 동의</h2>
        <button
          type="button"
          role="checkbox"
          aria-checked={agreed}
          onClick={() => setAgreed((v) => !v)}
          className="flex w-full items-start gap-2.5 text-left"
        >
          <span
            aria-hidden="true"
            className={[
              'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-xs text-[11px] font-bold',
              agreed ? 'bg-n-900 text-n-0' : 'border border-n-300',
            ].join(' ')}
          >
            {agreed ? '✓' : ''}
          </span>
          <span className="text-[13px] leading-relaxed">
            주문 내용을 확인했으며 개인정보 수집·이용 및 결제대행 서비스 약관에 동의합니다
          </span>
        </button>
      </section>

      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-4 py-3 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <Button type="submit" block aria-disabled={!canOrder}>
        {pending
          ? '주문 처리 중…'
          : q
            ? `${format(won(q.payable))}원 결제하기`
            : '주문하기'}
      </Button>
    </form>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-[13px] text-[var(--fg-secondary)]">{label}</dt>
      <dd className={`tnum text-[13px] ${accent ? 'text-accent' : ''}`}>{value}</dd>
    </div>
  );
}
