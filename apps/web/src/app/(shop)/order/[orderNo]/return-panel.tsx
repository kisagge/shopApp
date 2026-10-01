import { carrierOf, formatTrackingNumber, returnAddressLine, trackingUrlFor, type ReturnDestination, type ReturnReason, type ReturnStatus, type ReturnType } from '@shop/core';
import { CancelReturnButton } from '~/components/cancel-return-button';
import { getT } from '~/lib/i18n/server';
import { RETURN_TYPE_KEY, RETURN_REASON_KEY, RETURN_STATUS_KEY } from '~/lib/i18n/enum-labels';

/** 지금 걸린 신청 한 건. 지난 것은 이력으로만 남는다 */
export interface ActiveReturn {
  readonly type: string;
  readonly reason: string;
  readonly status: string;
  readonly detail: string | null;
  readonly rejectReason: string | null;
  readonly shippingBorneBy: string;
  readonly reshipCarrier: string | null;
  readonly reshipTrackingNumber: string | null;
  readonly exchangeLines: readonly {
    readonly orderItemId: string;
    readonly fromOptionLabel: string;
    readonly toOptionLabel: string;
    readonly quantity: number;
  }[];
}

/**
 * 반품·교환 신청의 지금 상태와, 승인됐으면 **어디로 보낼지.**
 *
 * **신청만 받고 아무것도 안 보여 주면** 손님은 접수가 된 건지 알 수 없다. 그리고 "상품을 보내 주세요" 만
 * 있고 주소가 없으면 받은 상자의 출고지로 보내거나 고객센터에 묻는다 — 출고지가 물류 대행사면 물건이
 * 엉뚱한 곳에 도착해 아무도 확인하지 못한다.
 *
 * 주문 상세에서 갈라 나왔다(650줄). 이 두 절은 **신청이 있을 때만** 서는 자리라, 없는 날에는 화면을
 * 읽는 사람도 이 파일을 열 일이 없다.
 */
export async function ReturnPanel({
  orderNo,
  items,
  activeReturn,
  returnTo,
  canCancelReturn,
}: {
  readonly orderNo: string;
  /** 보낼 곳마다 어느 줄을 담는지 적어 준다 — 판매처가 둘이면 상자를 나눠야 한다 */
  readonly items: readonly { readonly id: string; readonly productName: string; readonly optionLabel: string }[];
  readonly activeReturn: ActiveReturn | null;
  readonly returnTo: readonly ReturnDestination[];
  /** 승인 전까지만 무를 수 있다(core 의 canCancelOwnReturn) */
  readonly canCancelReturn: boolean;
}) {
  const t = await getT();

  return (
    <>
    {/*
      접수된 신청이 있으면 지금 어떤 상태인지 보여 준다.
      신청만 받고 아무것도 안 보여 주면 고객은 접수가 된 건지 알 수 없다.
    */}
    {activeReturn && (
      <section
        aria-labelledby="return-title"
        className="mt-8 rounded-sm border border-[var(--border)] p-4"
      >
        <h2 id="return-title" className="mb-3 text-sm font-semibold">
          {t('order.returnRequest', {
            type: t(RETURN_TYPE_KEY[activeReturn.type as ReturnType]),
          })}
        </h2>
        <dl className="flex flex-col gap-2 text-[13px]">
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
              {t('order.returnStatusLabel')}
            </dt>
            <dd className="font-medium">
              {t(RETURN_STATUS_KEY[activeReturn.status as ReturnStatus])}
            </dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
              {t('order.returnReasonLabel')}
            </dt>
            <dd>{t(RETURN_REASON_KEY[activeReturn.reason as ReturnReason])}</dd>
          </div>
          <div className="flex gap-3">
            <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
              {t('order.returnShipping')}
            </dt>
            <dd>
              {activeReturn.shippingBorneBy === 'CUSTOMER'
                ? t('order.borneByCustomer')
                : t('order.borneBySeller')}
            </dd>
          </div>
          {activeReturn.exchangeLines.length > 0 && (
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.exchangeLines')}
              </dt>
              <dd>
                {activeReturn.exchangeLines.map((l) => {
                  const item = items.find((i) => i.id === l.orderItemId);
                  return (
                    <span key={l.orderItemId} className="block">
                      {item?.productName} ({l.fromOptionLabel} → {l.toOptionLabel}) × {l.quantity}
                    </span>
                  );
                })}
              </dd>
            </div>
          )}
          {activeReturn.reshipTrackingNumber && (
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.exchangeReship')}
              </dt>
              <dd className="tnum">
                {carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier}{' '}
                {formatTrackingNumber(activeReturn.reshipTrackingNumber)}
                {/*
                  **새로 보낸 물건도 조회할 수 있어야 한다.** 첫 배송에는 조회 링크가 있는데 교환 송장은 번호만
                  적혀 있어, 손님이 택배사 누리집에 번호를 옮겨 적어야 했다. 같은 규칙(trackingUrlFor)으로 건다.
                */}
                {(() => {
                  const url = trackingUrlFor(activeReturn.reshipCarrier ?? '', activeReturn.reshipTrackingNumber);
                  if (!url) return null;
                  const carrierName = carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier ?? '';
                  return (
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 font-sans text-[12px] text-[var(--fg-secondary)] underline underline-offset-2"
                    >
                      {t('track.openAt', { carrier: carrierName })}
                      <span className="sr-only"> {t('track.newWindow')}</span>
                      <span aria-hidden="true"> ↗</span>
                    </a>
                  );
                })()}
              </dd>
            </div>
          )}
          {activeReturn.detail && (
            <div className="flex gap-3">
              <dt className="w-16 shrink-0 text-[12px] text-[var(--fg-muted)]">
                {t('order.returnDetail')}
              </dt>
              <dd className="leading-relaxed text-[var(--fg-secondary)]">{activeReturn.detail}</dd>
            </div>
          )}
        </dl>
        {/*
          까닭은 **끝난 신청 모두**에 보여 준다. 반려에만 보여 주다가, 승인된 교환을 무를 수 있게 되면서
          철회된 신청에는 "철회됨" 만 뜨고 왜인지는 어디에도 없었다 — 승인을 받고 기다리던 사람에게 그건
          물건이 그냥 사라진 것으로 읽힌다.
        */}
        {(activeReturn.status === 'REJECTED' || activeReturn.status === 'CANCELLED') && activeReturn.rejectReason && (
          <p className="mt-3 rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[12px] leading-relaxed text-accent">
            {t(activeReturn.status === 'CANCELLED' ? 'order.withdrawReason' : 'order.rejectReason')}
            : {activeReturn.rejectReason}
          </p>
        )}
        {/*
          **무를 길을 여기 둔다.** 승인 전까지만이다(core 의 canCancelOwnReturn) — 승인 뒤에는 보내 달라고
          말한 것이고, 그때부터는 운영진이 무르는 일이다. 이 단추가 없던 때에는 잘못 신청하면 주문이 반품접수에
          갇혀 구매확정도 자동 확정도 안 됐다.
        */}
        {canCancelReturn && (
          <CancelReturnButton
            orderNo={orderNo}
            type={activeReturn.type === 'EXCHANGE' ? 'EXCHANGE' : 'RETURN'}
          />
        )}
      </section>
    )}

    {/*
      **승인했으면 어디로 보낼지 적어 준다.** "상품을 보내 주세요" 만 있고 주소가 없으면 손님은 받은 상자에 적힌
      출고지로 보내거나 고객센터에 묻는다 — 출고지가 물류 대행사면 물건이 엉뚱한 곳에 도착해 아무도 확인하지 못한다.
      판매처가 둘이면 주소도 둘이고, 그때는 상자를 나눠야 한다는 것을 먼저 말한다.
    */}
    {returnTo.length > 0 && (
      <section
        aria-labelledby="return-to-title"
        className="mt-4 rounded-sm border border-[var(--border-strong)] p-4"
      >
        <h2 id="return-to-title" className="mb-2 text-sm font-semibold">{t('order.returnTo')}</h2>
        <p className="text-[12px] leading-relaxed text-[var(--fg-secondary)]">
          {t('order.returnToNote')}
          {returnTo.length > 1 && <> {t('order.returnToSplit')}</>}
        </p>

        <ul className="mt-3 flex flex-col gap-3">
          {returnTo.map((destination) => {
            const address = destination.address;
            if (!address) return null;
            const lines = items.filter((i) => destination.itemIds.includes(i.id));
            return (
              <li
                key={destination.merchantId ?? 'platform'}
                className="rounded-sm bg-[var(--surface-1)] p-3.5 text-[13px] leading-relaxed"
              >
                {/*
                  **알림을 누르고 들어오면 주소 한 벌이 있을 뿐이다.** 상자에 적어 둔 것이 옛 것인지
                  이것이 새 것인지 알 수 없어서, 알림은 "뭔가 바뀌었다" 까지만 전한다 — 바뀐 자리를
                  짚어 줘야 사람이 적어 둔 것과 견줄 수 있다.
                */}
                {destination.changedSinceApproval && (
                  <p className="mb-2 rounded-sm bg-accent-soft px-2.5 py-2 text-[12px] leading-relaxed text-accent-hover">
                    {t('order.returnToChanged')}
                  </p>
                )}
                <address className="not-italic">
                  <span className="block font-medium">
                    {t('order.returnToRecipient')} {address.recipient}
                  </span>
                  <span className="block">{returnAddressLine(address)}</span>
                  <span className="tnum block text-[var(--fg-secondary)]">
                    {t('order.returnToPhone')} {address.phone}
                  </span>
                </address>
                {returnTo.length > 1 && lines.length > 0 && (
                  <p className="mt-1.5 text-[12px] text-[var(--fg-secondary)]">
                    {t('order.returnToItems')}:{' '}
                    {lines.map((i) => `${i.productName} (${i.optionLabel})`).join(', ')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-3 text-[12px] text-[var(--fg-muted)]">
          {t('order.returnToTip', { orderNo: orderNo })}
        </p>
      </section>
    )}
    </>
  );
}
