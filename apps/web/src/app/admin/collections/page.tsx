import type { Metadata } from 'next';
import { requireAdmin } from '~/lib/admin/guard';
import { getAdminCollections, getCollectionItems } from '~/lib/admin/manage-collection';
import { CollectionEditor, type CollectionItem } from './collection-editor';

export const metadata: Metadata = { title: '기획전' };
export const dynamic = 'force-dynamic';

export default async function AdminCollectionsPage() {
  const actor = await requireAdmin('collection:read');
  const collections = await getAdminCollections(actor);

  /*
   * 담긴 상품까지 한 번에 실어 보낸다. 화면을 연 뒤 기획전마다 다시 물으면
   * 편집을 시작하기도 전에 요청이 여러 번 나가고, 그중 하나만 실패해도
   * 어떤 기획전이 비어 보이는지 알 수 없다.
   */
  const items: CollectionItem[] = await Promise.all(
    collections.map(async (c) => ({
      ...c,
      startsAt: c.startsAt?.toISOString() ?? null,
      endsAt: c.endsAt?.toISOString() ?? null,
      products: await getCollectionItems(actor, c.id),
    })),
  );

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">기획전</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum">{items.filter((c) => c.status === 'LIVE').length}</span>개 노출 중
          </p>
        </div>
      </header>

      <div className="p-8">
        <CollectionEditor initial={items} />
      </div>
    </>
  );
}
