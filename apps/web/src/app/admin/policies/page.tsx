import type { Metadata } from 'next';
import { POLICY_KIND, POLICY_KIND_LABEL, type PolicyKind } from '@shop/core';
import { prisma } from '@shop/db';
import { requireAdmin } from '~/lib/admin/guard';
import { getPolicies } from '~/lib/policies/policy';
import { getPolicyEdits } from '~/lib/queries/admin/last-edit';
import { PolicyEditor, type PolicyItem } from './policy-editor';

export const metadata: Metadata = { title: '약관·방침' };
export const dynamic = 'force-dynamic';

/** KST 날짜로 적는다 — 시행일은 날짜 단위이고, UTC 로 자르면 한국의 아침 아홉 시 전이 전날이 된다 */
const kstDay = (value: Date): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(value);

/**
 * 이용약관·개인정보처리방침.
 *
 * 공지·FAQ 와 화면을 나눈 까닭은 다루는 방식이 다르기 때문이다 — 목록에 쌓이는 글이 아니라 **한 벌짜리 약속**이고,
 * 고칠 때마다 판이 남으며 시행일이 따로 있다.
 */
export default async function AdminPoliciesPage() {
  const actor = await requireAdmin('support:write');

  const [docs, counts, edits] = await Promise.all([
    getPolicies(),
    prisma.policyRevision.groupBy({ by: ['kind'], _count: { _all: true } }),
    getPolicyEdits(actor),
  ]);

  const today = kstDay(new Date());
  const countOf = (kind: PolicyKind) => counts.find((c) => c.kind === kind)?._count._all ?? 0;

  const items: PolicyItem[] = POLICY_KIND.map((kind) => {
    const doc = docs.find((d) => d.kind === kind) ?? null;
    const edit = edits.get(kind);
    return {
      kind,
      title: doc?.title ?? POLICY_KIND_LABEL[kind],
      bodyRich: doc?.bodyRich ?? null,
      effectiveOn: doc ? kstDay(doc.effectiveAt) : today,
      updatedAt: doc?.updatedAt.toISOString() ?? null,
      lastEdit: edit ? { at: edit.at.toISOString(), by: edit.by } : null,
      revisionCount: countOf(kind),
    };
  });

  const missing = items.filter((i) => i.updatedAt === null).length;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">약관·방침</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            {missing > 0 ? <span className="text-warning">아직 안 쓴 문서 {missing}개</span> : '가입·결제 화면이 이 문서를 가리킵니다'}
          </p>
        </div>
      </header>

      <div className="flex max-w-[840px] flex-col gap-6 p-4 sm:p-8">
        {items.map((item) => (
          <PolicyEditor key={item.kind} item={item} />
        ))}
      </div>
    </>
  );
}
