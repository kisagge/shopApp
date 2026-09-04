import 'server-only';
import { prisma } from '@shop/db';
import { assertPermission, type Actor, type InquiryTopic, type SupportPostKind } from '@shop/core';
import { cachedRead, TAG, TTL } from '~/lib/cache';

/**
 * 고객센터 글 조회.
 *
 * 공지와 FAQ 는 한 표에 있고 **보여 주는 방식만 다르다.** 공지는 최근 순으로
 * 쌓이고 FAQ 는 갈래로 묶인다.
 */

export interface SupportPostView {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly topic: InquiryTopic | null;
  readonly pinned: boolean;
  readonly publishedAt: Date | null;
}

/** 손님에게 보이는 조건. 내보내지 않은 글과 지운 글은 없는 것과 같다. */
const visible = (kind: SupportPostKind) => ({
  kind,
  deletedAt: null,
  publishedAt: { not: null },
});

/**
 * 공지 목록.
 *
 * 고정한 것이 먼저, 그다음 최근 순이다. 고정을 날짜보다 뒤에 두면 고정해도
 * 새 글에 밀려서 고정한 뜻이 없어진다.
 */
const noticeRows = cachedRead(
  (limit: number | null) =>
    prisma.supportPost.findMany({
      where: visible('NOTICE'),
      orderBy: [{ pinned: 'desc' }, { publishedAt: 'desc' }, { id: 'desc' }],
      ...(limit === null ? {} : { take: limit }),
      select: { id: true, title: true, body: true, topic: true, pinned: true, publishedAt: true },
    }),
  { key: ['support-notices'], tags: [TAG.support], revalidate: TTL.support },
);

/**
 * 캐시를 지나온 값은 **날짜가 문자열이 되어 돌아온다.** 홈에서 한 번 겪은
 * 함정이라 경계에서 되살린다 — 화면이 toISOString 을 부르는 순간 터진다.
 */
const reviveDate = (post: SupportPostView): SupportPostView => ({
  ...post,
  publishedAt: post.publishedAt === null ? null : new Date(post.publishedAt),
});

export async function getNotices(limit?: number): Promise<SupportPostView[]> {
  return (await noticeRows(limit ?? null)).map(reviveDate);
}

export async function getNotice(id: string): Promise<SupportPostView | null> {
  const post = await prisma.supportPost.findFirst({
    where: { id, ...visible('NOTICE') },
    select: { id: true, title: true, body: true, topic: true, pinned: true, publishedAt: true },
  });
  return post;
}

export interface FaqGroup {
  readonly topic: InquiryTopic;
  readonly items: readonly SupportPostView[];
}

/**
 * FAQ — 갈래로 묶어서.
 *
 * **갈래가 비면 그 묶음은 아예 나오지 않는다.** 제목만 있고 아래가 빈
 * 묶음은 "여기는 아직 안 만들었습니다" 를 여섯 번 보여 주는 것과 같다.
 */
const faqRows = cachedRead(
  () =>
    prisma.supportPost.findMany({
      where: { ...visible('FAQ'), topic: { not: null } },
      orderBy: [{ sortOrder: 'asc' }, { publishedAt: 'asc' }, { id: 'asc' }],
      select: { id: true, title: true, body: true, topic: true, pinned: true, publishedAt: true },
    }),
  { key: ['support-faq'], tags: [TAG.support], revalidate: TTL.support },
);

export async function getFaq(): Promise<FaqGroup[]> {
  const rows = (await faqRows()).map(reviveDate);

  const byTopic = new Map<InquiryTopic, SupportPostView[]>();
  for (const row of rows) {
    // where 로 걸렀지만 타입은 여전히 null 을 허용한다
    if (row.topic === null) continue;
    const bucket = byTopic.get(row.topic);
    if (bucket) bucket.push(row);
    else byTopic.set(row.topic, [row]);
  }

  return [...byTopic].map(([topic, items]) => ({ topic, items }));
}

export interface AdminSupportPost extends SupportPostView {
  readonly kind: SupportPostKind;
  readonly sortOrder: number;
  readonly authorName: string | null;
  readonly updatedAt: Date;
}

/**
 * 운영진의 목록. **내보내지 않은 글도 보인다** — 초안을 못 보면 고칠 수 없다.
 */
export async function getAdminSupportPosts(actor: Actor): Promise<AdminSupportPost[]> {
  assertPermission(actor, 'admin:access');
  assertPermission(actor, 'support:write');

  const rows = await prisma.supportPost.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, kind: true, title: true, body: true, topic: true,
      pinned: true, sortOrder: true, publishedAt: true, updatedAt: true,
      author: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    topic: row.topic,
    pinned: row.pinned,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    authorName: row.author?.name ?? null,
  }));
}
