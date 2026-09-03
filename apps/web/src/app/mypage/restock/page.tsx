import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@shop/db';
import { getSessionUser } from '@shop/auth/session';
import { Badge } from '@shop/ui';
import { RestockRow } from '~/components/restock-row';

export const metadata: Metadata = { title: '재입고 알림' };
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
  const user = await getSessionUser(await headers());
  if (!user) redirect('/login?next=/mypage/restock');

  const rows = await load(user.id);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <h1 className="pt-8 pb-1 text-xl font-semibold tracking-tight md:text-2xl">재입고 알림</h1>
      {/*
        발송 경로가 없다는 사실을 숨기지 않는다. "알려 드리겠습니다" 라고만
        해 두고 아무 데도 안 오면 그게 더 나쁘다.
      */}
      <p className="pb-6 text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        재입고되면 이 목록에 표시됩니다. 메일·문자 발송은 아직 연결되지 않아
        직접 확인해 주셔야 합니다.
      </p>

      {rows.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          걸어 둔 알림이 없습니다. 품절된 옵션을 고르면 신청할 수 있습니다.
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
                  {r.notifiedAt !== null && <Badge tone="success">재입고됨</Badge>}
                </p>
                <p className="text-[13px] text-[var(--fg-secondary)]">{r.optionLabel}</p>
                {r.notifiedAt !== null && !r.inStock && (
                  <p className="text-[12px] text-[var(--fg-muted)]">
                    알림 이후 다시 품절됐습니다. 상품 화면에서 다시 신청할 수 있습니다.
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
