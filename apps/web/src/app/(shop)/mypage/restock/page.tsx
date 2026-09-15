import Link from 'next/link';
import { getViewer } from '~/lib/viewer';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@shop/db';
import { Badge } from '@shop/ui';
import { RestockRow } from '~/components/restock-row';
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
          product: { select: { name: true, slug: true, brand: { select: { name: true } } } },
        },
      },
    },
  });

  return rows.map((r) => ({
    variantId: r.variantId,
    optionLabel: r.variant.label,
    productName: r.variant.product.name,
    productSlug: r.variant.product.slug,
    brandName: r.variant.product.brand.name,
    inStock: r.variant.stock > 0,
    notifiedAt: r.notifiedAt,
  }));
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
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          {t('my.restockEmpty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((r) => (
            <li
              key={r.variantId}
              className="flex items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{r.brandName}</p>
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Link href={`/product/${r.productSlug}`} className="text-[var(--fg)]">
                    {r.productName}
                  </Link>
                  {/* 상태를 색으로만 알리지 않는다 */}
                  {r.notifiedAt !== null && <Badge tone="success">{t('my.restocked')}</Badge>}
                </p>
                <p className="text-[13px] text-[var(--fg-secondary)]">{r.optionLabel}</p>
                {r.notifiedAt !== null && !r.inStock && (
                  <p className="text-[12px] text-[var(--fg-muted)]">
                    {t('my.restockedThenOut')}
                  </p>
                )}
              </div>
              <RestockRow variantId={r.variantId} productName={r.productName} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
