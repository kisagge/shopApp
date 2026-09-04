import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminSupportPosts } from '~/lib/queries/support';
import { SupportEditor, type SupportPostItem } from './support-editor';

export const metadata: Metadata = { title: '공지·FAQ' };
export const dynamic = 'force-dynamic';

export default async function AdminSupportPage() {
  const actor = await requireAdmin('support:write');
  const posts = await getAdminSupportPosts(actor);

  // 폼이 문자열을 다루므로 경계에서 한 번만 바꿔 둔다
  const items: SupportPostItem[] = posts.map((p) => ({
    ...p,
    publishedAt: p.publishedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  }));

  const drafts = items.filter((p) => p.publishedAt === null).length;

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">공지·FAQ</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum">{items.length}</span>개 ·{' '}
            <span className="tnum">{drafts}</span>개 초안
          </p>
        </div>
      </header>

      <div className="p-8">
        <SupportEditor initial={items} />
      </div>
    </>
  );
}
