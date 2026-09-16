import type { Metadata } from 'next';
import { getPolicy, getPolicyRevision, getPolicyRevisions } from '~/lib/policies/policy';
import { PolicyView } from '~/components/policy-view';
import { getT } from '~/lib/i18n/server';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const [doc, t] = await Promise.all([getPolicy('PRIVACY'), getT()]);
  return { title: doc?.title ?? t('policy.PRIVACY') };
}

/**
 * 개인정보처리방침.
 *
 * `?v=<지난 판 id>` 로 지난 방침을 연다 — 주소 한 칸이면 되는 일에 화면을 하나 더 만들지 않는다. 다른 종류의 id 를
 * 넣으면 조회가 걸러 주고, 그때는 현재 방침을 보여 준다(없는 화면이 아니라 지금 효력을 갖는 것이 답이다).
 */
export default async function PrivacyPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const [doc, revisions, viewing] = await Promise.all([
    getPolicy('PRIVACY'),
    getPolicyRevisions('PRIVACY'),
    v ? getPolicyRevision('PRIVACY', v) : Promise.resolve(null),
  ]);

  return <PolicyView kind="PRIVACY" doc={doc} revisions={revisions} viewing={viewing} />;
}
