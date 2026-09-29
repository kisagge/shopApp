'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { formatMoney } from '@shop/i18n';
import { AddressForm } from './address-form';
import { useLocale, useT } from '~/lib/i18n/client';

/**
 * 주문의 배송지를 고친다.
 *
 * **아무도 못 고쳤다.** 상세주소를 잘못 적으면 출고 전이라도 방법이 없어, 취소하고 다시 사거나 1:1 문의로
 * 부탁해야 했다 — 운영자도 화면에서 할 수 없어 결국 DB 를 직접 만졌고, 그사이 송장이 나가면 오배송이다.
 *
 * 칸은 주문할 때와 같은 폼을 쓴다(AddressForm) — 우편번호 검색·도서산간 안내·칸별 오류 표시를 한 벌 더
 * 적지 않으려고 보내는 곳만 갈아 끼운다.
 *
 * **바뀐 배송비를 말해 준다.** 도서산간으로 들어가거나 나오면 금액이 따라 움직이는데, 조용히 바뀌면
 * 손님은 결제 금액이 왜 달라졌는지 모른다.
 */
export function OrderAddressEdit({
  orderNo,
  remoteSurcharge,
  current,
  endpoint,
}: {
  orderNo: string;
  remoteSurcharge: number;
  /**
   * 어느 창구로 보내는가. 기본은 손님 것이다.
   *
   * 운영 화면도 **같은 폼을 쓴다** — 규칙(언제까지·권역이 바뀌면 얼마)이 한 벌이라 화면도 한 벌이어야
   * 두 쪽이 다른 말을 하지 않는다. 운영 쪽 창구는 감사 로그를 남긴다는 것만 다르다.
   */
  endpoint?: string;
  current: {
    recipient: string;
    phone: string;
    postalCode: string;
    address1: string;
    address2: string | null;
    memo: string | null;
  };
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const memoId = useId();
  const [open, setOpen] = useState(false);
  const [memo, setMemo] = useState(current.memo ?? '');
  const [done, setDone] = useState<string | null>(null);

  if (!open) {
    return (
      <div className="mt-3 flex flex-col gap-2">
        <div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
            {t('orderAddr.edit')}
          </Button>
        </div>
        {/* 바뀐 결과는 폼이 닫힌 뒤에도 남는다 — 닫으면서 사라지면 저장됐는지 알 수 없다 */}
        {done && <p role="status" className="text-[12px] text-[var(--fg-secondary)]">{done}</p>}
      </div>
    );
  }

  return (
    <section
      aria-label={t('orderAddr.editing', { orderNo })}
      className="mt-3 rounded-sm border border-[var(--border-strong)] p-4"
    >
      <h3 className="mb-1 text-[13px] font-semibold">{t('orderAddr.editing', { orderNo })}</h3>
      <p className="mb-3 text-[12px] leading-relaxed text-[var(--fg-muted)]">{t('orderAddr.note')}</p>

      <AddressForm
        remoteSurcharge={remoteSurcharge}
        submitLabel={t('orderAddr.save')}
        onCancel={() => setOpen(false)}
        prefill={{
          recipient: current.recipient,
          phone: current.phone,
          postalCode: current.postalCode,
          address1: current.address1,
          address2: current.address2,
        }}
        /* 요청사항도 이 폼에서 함께 고친다 — 밖에 두면 저장 단추가 챙기는 것이 아닌 것처럼 보인다 */
        extraFields={
          <div className="flex flex-col gap-1.5">
            <label htmlFor={memoId} className="text-xs font-medium">{t('orderAddr.memo')}</label>
            <input
              id={memoId}
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              maxLength={100}
              className="h-11 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
            />
          </div>
        }
        submit={async (body) => {
          const res = await fetch(endpoint ?? `/api/orders/${orderNo}/address`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...body, ...(memo ? { deliveryMemo: memo } : {}) }),
          });
          const result = (await res.json().catch(() => ({}))) as {
            shippingDelta?: number;
            message?: string;
            fields?: Record<string, string>;
          };
          if (!res.ok) {
            return { message: result.message ?? t('orderAddr.failed'), fields: result.fields ?? {} };
          }
          const delta = result.shippingDelta ?? 0;
          setDone(
            delta === 0
              ? t('orderAddr.saved')
              : t('orderAddr.savedWithFee', {
                  amount: `${delta > 0 ? '+' : '−'}${formatMoney(locale, Math.abs(delta))}`,
                }),
          );
          return null;
        }}
        onSaved={() => {
          setOpen(false);
          router.refresh();
        }}
      />
    </section>
  );
}
