import type { ReactElement } from 'react';
import { carrierOf, formatTrackingNumber, type ReturnReason, type ReturnStatus, type ReturnType } from '@shop/core';
import {
  ReturnActions, CompleteReturnButton, ReceiveReturnButton, ShipExchangeForm, WithdrawReturnButton,
} from './return-actions';
import type { CompleteReturnPreview } from '~/lib/orders/complete-return';
import { getT } from '~/lib/i18n/server';
import { RETURN_TYPE_KEY, RETURN_REASON_KEY, RETURN_STATUS_KEY } from '~/lib/i18n/enum-labels';

/** 지금 걸린 신청 한 건. 지난 것은 이력으로만 남는다 */
export interface AdminActiveReturn {
  readonly type: string;
  readonly reason: string;
  readonly status: string;
  readonly detail: string | null;
  readonly rejectReason: string | null;
  readonly shippingBorneBy: string;
  readonly requestedAt: Date;
  readonly resolvedAt: Date | null;
  readonly receivedAt: Date | null;
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
 * 운영 화면의 반품·교환 한 절.
 *
 * **주문 상세가 560줄이었다.** 주문자·배송·결제·메모·이력·처리가 한 파일에 얹혀 있는데, 이 절은
 * 신청이 있을 때만 선다 — 없는 날에는 화면을 읽는 사람도 이 120줄을 지나갈 이유가 없다.
 *
 * 누가 무엇을 할 수 있는지는 부르는 쪽이 정해서 내려 준다(canResolveReturn) — 가맹점은 승인·회수까지,
 * 돈을 내보내는 환불은 운영진이다.
 */
export async function AdminReturnPanel({
  orderNo,
  items,
  people,
  activeReturn,
  returnLines,
  isExchange,
  canResolveReturn,
  canRefundReturn,
  mixedReturn,
  returnPreview,
  justReceived,
  Row,
}: {
  readonly orderNo: string;
  readonly items: readonly { readonly id: string; readonly productName: string }[];
  /** 누가 승인했고 누가 회수를 확인했는가 — 그때의 이름을 박아 둔 값이다 */
  readonly people: { readonly resolved: string | null; readonly received: string | null };
  readonly activeReturn: AdminActiveReturn | null;
  /** 돌려받을 줄 — 신청에 담긴 줄만 */
  readonly returnLines: readonly { readonly productName: string; readonly optionLabel: string; readonly quantity: number }[];
  readonly isExchange: boolean;
  readonly canResolveReturn: boolean;
  /** 돈을 내보내는 환불은 운영진이다 */
  readonly canRefundReturn: boolean;
  /** 다른 가맹점 상품이 섞여 내 차례가 아닌가 — 서로 기다리지 않게 그렇다고 적는다 */
  readonly mixedReturn: boolean;
  /** 환불하면 얼마가 나가는지 미리 센 것. 누르기 전에 보여 준다 */
  readonly returnPreview: CompleteReturnPreview | null;
  /** 방금 도착을 확인했는가 — 단추가 사라지므로 화면이 대신 말한다 */
  readonly justReceived: boolean;
  /** 이름표 한 줄. 주문 상세와 같은 모양을 써야 두 절이 갈리지 않는다 */
  readonly Row: (props: { label: string; value: string; small?: boolean }) => ReactElement;
}) {
  if (activeReturn === null) return null;
  const t = await getT();

  return (
    <section
      aria-labelledby="return-title"
      className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
    >
      {/*
        **누른 사람에게 끝났다고 말해 준다.** 확인을 기록하면 단추가 사라지므로, 그 단추가
        들고 있던 말도 함께 사라진다 — 방금 한 일만 여기서 한 번 알린다(주소의 done).
      */}
      {justReceived && activeReturn.receivedAt && (
        <p role="status" className="mb-4 rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
          도착을 확인했습니다. 운영진이 환불을 진행합니다.
        </p>
      )}
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 id="return-title" className="text-base font-semibold">
          {t(RETURN_TYPE_KEY[activeReturn.type as ReturnType])} 신청
        </h2>
        <span className="text-xs text-[var(--fg-muted)]">
          {t(RETURN_STATUS_KEY[activeReturn.status as ReturnStatus])}
        </span>
      </div>
      <dl className="flex flex-col">
        {isExchange ? (
          <Row
            label="교환할 상품"
            value={
              activeReturn.exchangeLines
                .map((l) => {
                  const item = items.find((i) => i.id === l.orderItemId);
                  return `${item?.productName ?? ''} (${l.fromOptionLabel} → ${l.toOptionLabel}) × ${l.quantity}`;
                })
                .join(', ') || '—'
            }
          />
        ) : (
          <Row
            label="돌려받을 상품"
            value={returnLines.map((i) => `${i.productName} (${i.optionLabel}) × ${i.quantity}`).join(', ') || '—'}
          />
        )}
        <Row label="사유" value={t(RETURN_REASON_KEY[activeReturn.reason as ReturnReason])} />
        <Row
          label="반송비"
          value={activeReturn.shippingBorneBy === 'CUSTOMER' ? '고객 부담' : '판매자 부담'}
        />
        <Row
          label="신청일"
          value={activeReturn.requestedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}
        />
        {activeReturn.detail && <Row label="상세" value={activeReturn.detail} />}
        {activeReturn.rejectReason && (
          <Row label="반려 사유" value={activeReturn.rejectReason} />
        )}
        {activeReturn.resolvedAt && people.resolved && (
          <Row
            // 마무리(회수·교환 발송)하면 그 사람으로 덮인다 — 상태에 맞춰 무엇을 한 사람인지 적는다
            label={activeReturn.status === 'REJECTED' ? '반려한 사람'
              : activeReturn.status === 'COMPLETED' ? '처리를 마친 사람' : '승인한 사람'}
            value={`${people.resolved} · ${activeReturn.resolvedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}`}
          />
        )}
        {activeReturn.status === 'APPROVED' || activeReturn.status === 'COMPLETED' ? (
          <Row
            label="회수 확인"
            value={
              activeReturn.receivedAt
                ? `${activeReturn.receivedAt.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}${people.received ? ` · ${people.received}` : ''}`
                : '아직 — 물건이 도착하면 확인합니다'
            }
          />
        ) : null}
        {activeReturn.reshipTrackingNumber && (
          <Row
            label="교환 송장"
            value={`${carrierOf(activeReturn.reshipCarrier ?? '')?.name ?? activeReturn.reshipCarrier ?? ''} ${formatTrackingNumber(activeReturn.reshipTrackingNumber)}`}
          />
        )}
      </dl>

      {mixedReturn && (
        <p className="mt-4 rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-[12px] leading-relaxed text-[var(--fg-secondary)]">
          다른 가맹점 상품이 함께 신청된 반품이라 운영진이 처리합니다.
        </p>
      )}

      {/*
        아직 처리 안 된 신청에만 버튼을 둔다. 이미 승인·반려한 것에
        다시 버튼이 보이면 두 번 누르게 된다.
      */}
      {activeReturn.status === 'REQUESTED' && canResolveReturn && (
        <ReturnActions orderNo={orderNo} exchange={isExchange} />
      )}
      {/* 교환은 돈이 안 움직여 반품 처리 권한으로 끝까지 한다 — 환불 단추 대신 교환 상품 발송 */}
      {isExchange && activeReturn.status === 'APPROVED' && canResolveReturn && (
        <ShipExchangeForm orderNo={orderNo} />
      )}
      {/* 물건이 도착하면 확인한다 — 가맹점이 누르고, 운영진은 이 기록을 보고 환불한다 */}
      {!isExchange && activeReturn.status === 'APPROVED' && !activeReturn.receivedAt && canResolveReturn && !canRefundReturn && (
        <ReceiveReturnButton orderNo={orderNo} />
      )}
      {/* 돈을 내보내는 것은 운영진이다. 금액은 서버가 미리 센 값이다 */}
      {!isExchange && activeReturn.status === 'APPROVED' && canRefundReturn && (
        <CompleteReturnButton
          orderNo={orderNo}
          preview={returnPreview}
          received={activeReturn.receivedAt !== null}
        />
      )}
      {/*
        **승인한 뒤에도 무를 수 있다.** 물건이 오지 않으면 신청은 승인된 채로 남고, 교환이라면 바꿀
        옵션의 재고가 함께 묶인다 — 아무도 안 받을 물건이 품절로 보인다. 되돌릴 길이 없었다.
      */}
      {activeReturn.status === 'APPROVED' && canResolveReturn && (
        <WithdrawReturnButton orderNo={orderNo} exchange={isExchange} />
      )}
    </section>
  );
}
