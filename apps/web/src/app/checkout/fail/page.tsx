import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: '결제 실패' };
export const dynamic = 'force-dynamic';

/**
 * 결제창이 실패로 돌아오는 자리.
 *
 * 토스가 code·message 를 붙여 보낸다. **그 문구를 그대로 화면에 넣지 않는다** —
 * 쿼리는 누구나 고칠 수 있어서, 링크 하나로 우리 도메인에 원하는 문장을
 * 띄울 수 있게 된다. 아는 코드만 우리 문구로 바꿔 보여 준다.
 */
const REASON: Readonly<Record<string, string>> = {
  PAY_PROCESS_CANCELED: '결제를 취소하셨습니다.',
  PAY_PROCESS_ABORTED: '결제가 중단됐습니다. 다시 시도해 주세요.',
  REJECT_CARD_COMPANY: '카드사에서 결제를 거절했습니다. 다른 수단으로 시도해 주세요.',
  INVALID_CARD_EXPIRATION: '카드 유효기간이 올바르지 않습니다.',
  EXCEED_MAX_DAILY_PAYMENT_COUNT: '하루 결제 한도를 넘었습니다.',
  NOT_ENOUGH_BALANCE: '잔액이 부족합니다.',
  INVALID_CALLBACK: '결제 정보가 올바르지 않아 확인하지 못했습니다.',
  ORDER_NOT_FOUND: '주문을 찾을 수 없습니다. 결제가 진행됐다면 주문 내역에서 확인해 주세요.',
};

export default async function CheckoutFailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params['code'];
  const code = typeof raw === 'string' ? raw : '';
  const message = REASON[code] ?? '결제를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.';

  return (
    <main className="mx-auto flex w-full max-w-lg flex-col items-center gap-6 px-5 py-24 text-center">
      <h1 className="text-[22px] font-semibold tracking-tight">결제를 완료하지 못했습니다</h1>
      <p className="text-[15px] leading-relaxed text-[var(--fg-secondary)]">{message}</p>
      <p className="text-[13px] text-[var(--fg-muted)]">
        결제가 되지 않았으므로 금액은 청구되지 않습니다. 장바구니는 그대로 있습니다.
      </p>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/checkout"
          className="rounded-md bg-n-900 px-5 py-2.5 text-[14px] font-medium text-n-0 no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          다시 결제하기
        </Link>
        <Link
          href="/cart"
          className="rounded-md border border-[var(--border)] px-5 py-2.5 text-[14px] font-medium text-[var(--fg)] no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
        >
          장바구니로
        </Link>
      </div>
    </main>
  );
}
