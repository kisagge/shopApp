import Link from 'next/link';
import Image from 'next/image';
import { orderLineReviewLink, type OrderStatus } from '@shop/core';
import { formatMoney } from '@shop/i18n';
import { getLocale, getT } from '~/lib/i18n/server';

/** 주문에 박힌 줄. 살아 있는 상품이 아니라 **산 그때의 값**이다 */
export interface OrderLine {
  readonly id: string;
  readonly canceledAt: Date | null;
  readonly status: string;
  readonly productName: string;
  readonly brandName: string;
  readonly optionLabel: string;
  readonly imageUrl: string | null;
  readonly quantity: number;
  readonly subtotal: number;
  readonly variant: { readonly productId: string };
  readonly review: { readonly id: string; readonly deletedAt: Date | null } | null;
}

/**
 * 주문 상품 목록.
 *
 * **주문 상세가 650줄이었다.** 큰 제목·결제 정보·배송지·반품이 한 파일에 얹혀 있어서, "취소된 줄을
 * 어떻게 표시하는가" 하나를 고치려면 그 사이를 뒤져야 했다. 화면의 뜻이 갈리는 자리에서 파일도 가른다.
 *
 * 말과 통화는 스스로 읽는다 — 요청 안에서 한 번만 계산되므로(getT·getLocale) 넘겨받을 이유가 없다.
 */
export async function OrderLines({
  items,
  orderStatus,
  productSlugs,
  exchanging,
}: {
  readonly items: readonly OrderLine[];
  /** 후기로 가는 길과 줄 이름표가 주문 상태를 본다 */
  readonly orderStatus: OrderStatus;
  /** 매대에 나와 있는 상품만 — 내린 상품은 링크를 걸지 않는다(404 로 끝나는 막다른 길이다) */
  readonly productSlugs: ReadonlyMap<string, string>;
  /** 지금 걸린 신청이 교환인가 — 줄에 붙는 이름표가 달라진다 */
  readonly exchanging: boolean;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const money = (amount: number) => formatMoney(locale, amount);

  return (
    <section aria-labelledby="items-title" className="border-t border-[var(--border)] pt-6">
      <h2 id="items-title" className="mb-3.5 text-sm font-semibold">
        {t('checkout.items')} <span className="tnum text-[var(--fg-muted)]">{items.length}</span>
      </h2>
      <ul className="flex flex-col gap-3">
        {items.map((i) => (
          <li key={i.id} className={`flex items-center justify-between gap-3 ${i.canceledAt ? 'opacity-60' : ''}`}>
            {/*
              **주문에 박아 둔 사진이다.** 살아 있는 상품에서 다시 읽지
              않는다 — 상품이 바뀌거나 지워져도 산 것은 그대로 남아야 한다.
              그래서 자리표시 그림은 없다: 그건 살아 있는 상품에서만
              따라오는 값이고, 여기 두려면 주문에도 칸을 하나 더 박아야 한다.
              작은 썸네일이라 그만한 값이 없다.
            */}
            {i.imageUrl && (
              <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-sm bg-[var(--surface-2)]">
                <Image
                  src={i.imageUrl}
                  alt=""
                  aria-hidden="true"
                  fill
                  sizes="44px"
                  className="object-cover"
                />
              </span>
            )}
            <span className="flex flex-1 flex-col gap-0.5">
              <span className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{i.brandName}</span>
              <span className="text-[13px]">
                {/*
                  **산 물건의 화면으로 간다.** 다시 사거나 설명을 다시 보려면 검색부터 해야 했다. 내린 상품은
                  링크를 걸지 않는다 — 404 로 끝나는 막다른 길이다. 이름은 주문에 박힌 그때의 이름이다.
                */}
                {productSlugs.has(i.variant.productId) ? (
                  <Link href={`/product/${productSlugs.get(i.variant.productId)!}`} className="text-[var(--fg)] underline-offset-2 hover:underline">
                    {i.productName}
                  </Link>
                ) : (
                  i.productName
                )}
                {/* 흐리게만 하면 색을 못 보는 사람에게는 취소됐는지 알 길이 없다 */}
                {(i.canceledAt || i.status === 'RETURN_REQUESTED') && (
                  <span className="ml-1.5 rounded-full border border-[var(--border-strong)] px-1.5 py-px text-[10px] text-[var(--fg-secondary)]">
                    {t(
                      i.status === 'RETURN_REQUESTED'
                        ? exchanging ? 'order.lineExchanging' : 'order.lineReturning'
                        : i.status === 'REFUNDED' && orderStatus !== 'REFUNDED'
                          ? 'order.lineRefunded'
                          : 'order.lineCanceled',
                    )}
                  </span>
                )}
              </span>
              <span className="text-[11px] text-[var(--fg-muted)]">
                {i.optionLabel} · <span className="tnum">{i.quantity}</span>
              </span>
              {(() => {
                const review = orderLineReviewLink({
                  orderStatus, lineCanceled: i.canceledAt !== null, review: i.review,
                });
                if (!review) return null;
                /*
                 * **주문을 보다가 후기로 간다.** 받은 물건을 확인하는 자리가 후기를 떠올리는 자리인데, 다른 메뉴에서
                 * 그 줄을 다시 찾아야 했다. 링크 이름에 상품명을 붙인다 — "후기 쓰기" 가 여럿이면 어느 것인지 모른다.
                 */
                return (
                  <Link
                    href={review.kind === 'EDIT'
                      ? `/mypage/reviews/${review.reviewId}/edit`
                      : `/mypage/reviews#review-item-${i.id}`}
                    className="mt-1 w-fit text-[11px] text-[var(--fg-secondary)] underline underline-offset-2"
                  >
                    {t(review.kind === 'EDIT' ? 'order.lineEditReview' : 'order.lineWriteReview')}
                    <span className="sr-only"> — {i.productName}</span>
                  </Link>
                );
              })()}
            </span>
            <span className="tnum text-sm font-semibold">{money(i.subtotal)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
