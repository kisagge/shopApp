import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminBanners } from '~/lib/admin/manage-banner';
import { BannerEditor, type BannerItem } from './banner-editor';

export const metadata: Metadata = { title: '배너' };
export const dynamic = 'force-dynamic';

export default async function AdminBannersPage() {
  const actor = await requireAdmin('banner:read');
  const banners = await getAdminBanners(actor);

  // Date 는 클라이언트 컴포넌트로 그대로 넘길 수 있지만, 폼이 문자열을
  // 다루므로 여기서 한 번만 바꿔 둔다.
  const items: BannerItem[] = banners.map((b) => ({
    ...b,
    startsAt: b.startsAt?.toISOString() ?? null,
    endsAt: b.endsAt?.toISOString() ?? null,
  }));

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">배너</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            홈 최상단 · <span className="tnum">{items.filter((b) => b.status === 'LIVE').length}</span>개 노출 중
          </p>
        </div>
      </header>

      <main className="p-8">
        <BannerEditor initial={items} />
      </main>
    </>
  );
}
