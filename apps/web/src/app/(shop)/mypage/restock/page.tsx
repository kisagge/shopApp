import Link from 'next/link';
import { getViewer } from '~/lib/viewer';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@shop/db';
import { isOnDisplay } from '@shop/core';
import { RestockList } from '~/components/restock-list';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('my.restockHeading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

async function load(userId: string) {
  const rows = await prisma.restockNotification.findMany({
    where: { userId },
    // 알림이 온 것이 먼저. 그게 지금 보러 온 이유일 가능성이 높다.
    orderBy: [{ notifiedAt: 'desc' }, { createdAt: 'desc' }],
    select: {
      variantId: true,
      notifiedAt: true,
      createdAt: true,
      variant: {
        select: {
          label: true, stock: true,
          product: {
            select: {
              name: true, slug: true, status: true, deletedAt: true, publishedAt: true,
              brand: { select: { name: true, merchant: { select: { status: true } } } },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => {
    const product = r.variant.product;
    return {
      variantId: r.variantId,
      optionLabel: r.variant.label,
      productName: product.name,
      productSlug: product.slug,
      brandName: product.brand.name,
      inStock: r.variant.stock > 0,
      notified: r.notifiedAt !== null,
      /*
       * **오지 않을 알림을 기다리게 두지 않는다.**
       *
       * 신청은 매대에 서 있을 때만 받고(subscribeRestock), 보내는 쪽도 같은 것을 본다. 그 사이에
       * 상품이 내려가면 이 줄은 영영 기다리는 줄이 되는데, 화면은 아무 말도 하지 않았다 — 손님은
       * 기다리고 있다고 믿는다. 판단은 core 가 한다(찜 목록과 같은 함수).
       */
      unavailable: !isOnDisplay({
        deletedAt: product.deletedAt,
        publishedAt: product.publishedAt,
        status: product.status,
        merchantStatus: product.brand.merchant?.status ?? null,
      }),
    };
  });
}

export default async function RestockPage() {
  const user = await getViewer();
  if (!user) redirect('/login?next=/mypage/restock');
  const t = await getT();

  const rows = await load(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-1 text-xl font-semibold tracking-tight md:text-2xl">
        {t('my.restockHeading')}
      </h1>
      {/*
        **어디로 알려 주는지 사실대로 적는다.** 한동안 "메일·문자 발송은 아직 연결되지 않았다" 고 적혀 있었는데, 그사이
        메일과 알림함 알림이 붙어 문구만 옛날에 머물렀다 — 받고 있는 알림을 "안 온다" 고 말하고 있었다. 보내지 않는
        경로(문자)는 그대로 밝힌다. 경로를 더하거나 빼면 이 문구와 restock/notify 를 함께 고친다.
      */}
      <p className="pb-6 text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        {t('my.restockLead')}
      </p>

      {rows.length === 0 ? (
        // 알림은 품절 옵션을 골라야 걸 수 있다 — 그 옵션이 있는 자리로 보낸다
        <div className="flex flex-col items-center gap-3 py-16">
          <p className="text-[13px] text-[var(--fg-muted)]">{t('my.restockEmpty')}</p>
          <Link href="/" className="mt-2 inline-flex h-11 items-center rounded-sm border border-[var(--border-strong)] px-5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]">
            {t('my.wishlistGo')}
          </Link>
        </div>
      ) : (
        <RestockList rows={rows} />
      )}
    </div>
  );
}
