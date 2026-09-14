import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { isReceiptIssuable } from '@shop/core';
import { getViewer } from '~/lib/viewer';
import { getOrderForUser } from '~/lib/queries/orders';
import { NO_INDEX } from '~/lib/no-index';
import { getLocale, getT } from '~/lib/i18n/server';
import { OrderReceipt } from '~/components/order-receipt';
import { PrintButton } from '~/components/print-button';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('receipt.title'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/**
 * 주문 영수증.
 *
 * 주문 상세와 **같은 조회**를 쓴다 — 소유자만 열고(남의 주문번호로는 없는 주문과 똑같이 404), 금액도 같은 값에서
 * 나온다. 영수증만 따로 읽으면 두 화면의 숫자가 갈릴 수 있다.
 */
export default async function ReceiptPage({ params }: { params: Promise<{ orderNo: string }> }) {
  const { orderNo } = await params;
  const user = await getViewer();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/order/${orderNo}/receipt`)}`);

  const [order, locale, t] = await Promise.all([getOrderForUser(orderNo, user.id), getLocale(), getT()]);
  if (!order) notFound();

  const back = (
    <Link
      href={`/order/${encodeURIComponent(order.orderNo)}`}
      className="inline-flex h-12 items-center justify-center rounded-sm border border-[var(--border-strong)] px-5 text-sm font-medium no-underline print:hidden"
    >
      {t('receipt.back')}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-10 md:px-10 print:max-w-none print:p-0">
      {isReceiptIssuable(order) && order.paidAt ? (
        <>
          <OrderReceipt order={{ ...order, paidAt: order.paidAt }} locale={locale} t={t} issuedAt={new Date()} />
          <div className="mt-10 flex flex-wrap gap-2 print:hidden">
            <PrintButton />
            {back}
          </div>
        </>
      ) : (
        <div className="flex flex-col items-start gap-4">
          <h1 className="text-xl font-semibold">{t('receipt.title')}</h1>
          {/* 결제대기 주문의 영수증은 내지 않은 돈의 증빙이 된다(isReceiptIssuable) */}
          <p className="text-[13px] text-[var(--fg-secondary)]">{t('receipt.notIssuable')}</p>
          {back}
        </div>
      )}
    </div>
  );
}
