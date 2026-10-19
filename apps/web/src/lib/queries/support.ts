import 'server-only';
import { cache } from 'react';
import { prisma } from '@shop/db';
import {
  asRichTextDoc,
  type Actor, type InquiryTopic, type RichTextDoc, type SupportPostKind,
} from '@shop/core';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import { assertAdminQuery } from './admin/scope';

/**
 * 고객센터 글 조회.
 *
 * 공지와 FAQ 는 한 표에 있고 **보여 주는 방식만 다르다.** 공지는 최근 순으로
 * 쌓이고 FAQ 는 갈래로 묶인다.
 */

export interface SupportPostView {
  readonly id: string;
  readonly title: string;
  /** 서식을 뺀 본문. 목록 요약과 검색이 쓴다. */
  readonly body: string;
  /** 서식 있는 본문. 서식 없이 쓰인 옛 글은 null 이고, 그때는 body 를 그린다. */
  readonly bodyRich: RichTextDoc | null;
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
      /*
       * **목록은 나무를 싣지 않는다.** 제목과 요약만 보여 주는데 본문 나무까지
       * 실으면 캐시 한 칸이 글 수만큼 커진다. 나무가 필요한 것은 본문뿐이다.
       */
      select: { id: true, title: true, body: true, topic: true, pinned: true, publishedAt: true },
    }),
  { key: ['support-notices'], tags: [TAG.support], revalidate: TTL.support },
);

/**
 * 캐시를 지나온 값은 **날짜가 문자열이 되어 돌아온다.** 홈에서 한 번 겪은
 * 함정이라 경계에서 되살린다 — 화면이 toISOString 을 부르는 순간 터진다.
 */
const reviveDate = <T extends { publishedAt: Date | null }>(post: T): T => ({
  ...post,
  publishedAt: post.publishedAt === null ? null : new Date(post.publishedAt),
});

/** 목록에 필요한 것 — 나무는 없다 */
export type SupportPostSummary = Omit<SupportPostView, 'bodyRich'>;

export async function getNotices(limit?: number): Promise<SupportPostSummary[]> {
  return (await noticeRows(limit ?? null)).map(reviveDate);
}

/**
 * 공지 한 건.
 *
 * **한 요청 안에서는 한 번만 읽는다.** 제목(generateMetadata)과 본문이 같은 공지를
 * 각각 부른다 — 목록(noticeRows)은 진작 캐시를 지나는데 본문만 맨 조회로 남아 있었다.
 * 여기서 `cachedRead` 까지 가지 않는 것은 날짜가 문자열로 돌아오는 함정 때문이다
 * (위 reviveDate 주석) — 요청 안 중복만 없애면 이 화면의 왕복은 둘에서 하나가 된다.
 */
export const getNotice = cache(async (id: string): Promise<SupportPostView | null> => {
  const post = await prisma.supportPost.findFirst({
    where: { id, ...visible('NOTICE') },
    select: {
      id: true, title: true, body: true, bodyRich: true,
      topic: true, pinned: true, publishedAt: true,
    },
  });
  return post === null ? null : { ...post, bodyRich: asRichTextDoc(post.bodyRich) };
});

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
      // FAQ 는 목록에서 답까지 펼쳐 보여 주므로 여기는 나무가 필요하다
      select: {
        id: true, title: true, body: true, bodyRich: true,
        topic: true, pinned: true, publishedAt: true,
      },
    }),
  { key: ['support-faq'], tags: [TAG.support], revalidate: TTL.support },
);

export async function getFaq(): Promise<FaqGroup[]> {
  const rows = (await faqRows())
    .map(reviveDate)
    .map((row) => ({ ...row, bodyRich: asRichTextDoc(row.bodyRich) }));

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

/**
 * 운영 목록이 그리는 것 — **본문은 없다.**
 *
 * 전에는 글마다 `body` 와 `bodyRich` 를 함께 읽어 화면으로 내려보냈다. 목록이 그리는 것은
 * 갈래·제목·고정·상태뿐이고, 본문이 필요한 때는 **고칠 글 한 건**뿐이다. 그런데 그 한 건을
 * 위해 모든 글의 서식 나무가 응답에 실렸고, 글이 쌓이는 만큼 영구히 자랐다 — 상한도
 * 페이징도 없는 자리다.
 *
 * 손님 쪽 공지 목록은 진작 이 교훈을 적어 두었다("목록은 나무를 싣지 않는다 … 캐시 한 칸이
 * 글 수만큼 커진다"). 운영 목록만 그것을 비켜 가 있었다.
 */
export interface AdminSupportPost {
  readonly id: string;
  readonly kind: SupportPostKind;
  readonly title: string;
  readonly topic: InquiryTopic | null;
  readonly pinned: boolean;
  readonly sortOrder: number;
  readonly publishedAt: Date | null;
  readonly updatedAt: Date;
  readonly authorName: string | null;
}

/** 고칠 때 받아 가는 한 건. 본문이 여기 있다. */
export interface AdminSupportPostDetail extends Omit<AdminSupportPost, 'updatedAt' | 'authorName'> {
  readonly body: string;
  readonly bodyRich: RichTextDoc | null;
}

/**
 * 운영진의 목록. **내보내지 않은 글도 보인다** — 초안을 못 보면 고칠 수 없다.
 *
 * 전부 준다. 자리 순서(`sortOrder`)를 손으로 매기는 화면이라 이웃이 안 보이면 순서를 정할
 * 수 없어서, 페이징 대신 **본문을 안 읽는 쪽**으로 가볍게 만들었다.
 */
export async function getAdminSupportPosts(actor: Actor): Promise<AdminSupportPost[]> {
  assertAdminQuery(actor, 'support:write');

  const rows = await prisma.supportPost.findMany({
    where: { deletedAt: null },
    orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    select: {
      id: true, kind: true, title: true, topic: true,
      pinned: true, sortOrder: true, publishedAt: true, updatedAt: true,
      author: { select: { name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    title: row.title,
    topic: row.topic,
    pinned: row.pinned,
    sortOrder: row.sortOrder,
    publishedAt: row.publishedAt,
    updatedAt: row.updatedAt,
    authorName: row.author?.name ?? null,
  }));
}

/**
 * 고칠 글 한 건 — 본문까지.
 *
 * **지운 글은 안 준다.** 목록에 없는 글의 주소를 들고 와도 열리지 않아야, 화면이 고칠 수
 * 없는 것을 고칠 수 있는 것처럼 내밀지 않는다(저장 쪽도 같은 조건으로 막는다).
 */
export async function getAdminSupportPost(
  actor: Actor,
  id: string,
): Promise<AdminSupportPostDetail | null> {
  assertAdminQuery(actor, 'support:write');

  const row = await prisma.supportPost.findFirst({
    where: { id, deletedAt: null },
    select: {
      id: true, kind: true, title: true, body: true, bodyRich: true,
      topic: true, pinned: true, sortOrder: true, publishedAt: true,
    },
  });
  if (!row) return null;

  return { ...row, bodyRich: asRichTextDoc(row.bodyRich) };
}
