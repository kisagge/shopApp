import 'server-only';
import { prisma } from '@shop/db';
import {
  offsetOf,
  hasPermission,
  canReadInquiry, canAnswerInquiry, assertPermission, actorLabel,
  type Actor, type InquiryTopic,
} from '@shop/core';
import { clampToLastPage } from './paged';

/**
 * 상품 문의 조회.
 *
 * **비공개 문의는 서버에서 지운 채 내려보낸다.** 화면에서 감추기만 하면
 * HTML 에는 그대로 실려 나가고, 개발자 도구를 열면 보인다. 볼 수 없는
 * 사람에게는 내용 자체를 주지 않는다.
 */

export interface PublicInquiry {
  readonly id: string;
  readonly content: string;
  readonly isPrivate: boolean;
  /**
   * 내용을 볼 수 있는가.
   *
   * 못 보면 `content` 는 **빈 문자열**이다 — 대체 문구를 서버가 골라
   * 실어 보내면 그 한 줄만 한국어로 굳는다. 뭐라고 적을지는 화면이 정한다.
   */
  readonly readable: boolean;
  readonly authorName: string;
  readonly createdAt: Date;
  readonly answer: string | null;
  readonly answeredAt: Date | null;
  readonly isMine: boolean;
  readonly canAnswer: boolean;
}

/** 가운데를 가린다. 리뷰와 같은 규칙. */
function maskAuthor(name: string): string {
  if (name.length <= 1) return name;
  if (name.length === 2) return `${name[0]}○`;
  return `${name[0]}${'○'.repeat(name.length - 2)}${name.at(-1)}`;
}

const PAGE_SIZE = 10;

export async function getProductInquiries(
  productId: string,
  viewer: Actor | null,
  options: { cursor?: string | undefined } = {},
): Promise<{ items: PublicInquiry[]; nextCursor: string | null }> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { brand: { select: { merchantId: true } } },
  });
  const scope = { merchantId: product?.brand.merchantId ?? null };

  const rows = await prisma.inquiry.findMany({
    where: { productId, deletedAt: null },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE_SIZE + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {}),
    select: {
      id: true, content: true, isPrivate: true, createdAt: true,
      answer: true, answeredAt: true, authorId: true,
      author: { select: { name: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const canAnswer = viewer !== null && canAnswerInquiry(viewer, scope);

  return {
    items: page.map((row) => {
      const readable = canReadInquiry(viewer, row, scope);
      return {
        id: row.id,
        // 볼 수 없으면 내용을 아예 싣지 않는다
        content: readable ? row.content : '',
        isPrivate: row.isPrivate,
        readable,
        authorName: maskAuthor(row.author.name),
        createdAt: row.createdAt,
        answer: readable ? row.answer : null,
        answeredAt: row.answeredAt,
        isMine: viewer !== null && viewer.id === row.authorId,
        canAnswer,
      };
    }),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
  };
}

export interface AdminInquiryRow {
  readonly id: string;
  /** 고객센터로 들어온 문의는 상품이 없다 */
  readonly productId: string | null;
  readonly productName: string | null;
  readonly topic: InquiryTopic | null;
  readonly content: string;
  readonly isPrivate: boolean;
  readonly authorName: string;
  readonly createdAt: Date;
  readonly answer: string | null;
  readonly answeredAt: Date | null;
  /**
   * 답한 사람을 보는 사람에게 맞게 적은 말(core 의 actorLabel). 답이 없으면 null.
   *
   * **적어 두기만 했다.** 담당자가 여럿인 가게에서 "이 답은 누가 했지" 에 답하려면 감사 로그를
   * 뒤져야 했다. 가맹점이 보면 운영진의 이름은 "운영진" 으로만 나간다.
   */
  readonly answeredBy: string | null;
  /** 첨부한 사진 주소(1:1 문의) — 답할 사람은 봐야 한다 */
  readonly imageUrls: readonly string[];
}

/**
 * 운영진·가맹점의 문의 목록.
 *
 * 가맹점은 자기 브랜드 상품의 문의만 본다 — 답할 수 있는 것만 보여야
 * 목록이 할 일 목록이 된다.
 */
/**
 * 답할 사람에게 보이는 문의.
 *
 * 가맹점에게는 **자기 상품의 문의만** 보인다. 고객센터로 들어온 문의는 상품이 없어 이 조건에 걸리지
 * 않으므로 자연히 빠진다 — 배송·환불은 플랫폼이 답할 몫이라 그것이 맞다.
 */
function inquiryScope(actor: Actor) {
  return {
    deletedAt: null,
    ...(actor.merchantId ? { product: { brand: { merchantId: actor.merchantId } } } : {}),
  };
}

/**
 * 답변을 기다리는 문의 수 — 사이드바 뱃지.
 *
 * **문의 화면의 "답변 대기" 와 같은 조건이다**(inquiryScope + answeredAt: null). 따로 세면 뱃지는 3 인데
 * 들어가 보면 2 건인 날이 오고, 그러면 뱃지를 믿지 않게 된다. 답할 권한이 없으면 0 이다.
 */
export async function countPendingInquiries(actor: Actor): Promise<number> {
  if (!hasPermission(actor, 'inquiry:answer')) return 0;
  return prisma.inquiry.count({ where: { ...inquiryScope(actor), answeredAt: null } });
}

/**
 * 운영 문의함 한 쪽 크기.
 *
 * 예전에는 26을 받아 25만 그리는 방식이었다(한 줄 더 받아 다음 쪽이 있는지 보는 커서식). 쪽 번호로 바꾸면서
 * 그 한 줄이 필요 없어졌다 — 전체 수를 따로 센다.
 */
const ADMIN_INQUIRY_PAGE_SIZE = 25;

export async function getAdminInquiries(
  actor: Actor,
  query: { unanswered?: boolean; page?: number } = {},
): Promise<{ rows: AdminInquiryRow[]; total: number; pending: number }> {
  assertPermission(actor, 'inquiry:answer');

  const scoped = inquiryScope(actor);
  const where = { ...scoped, ...(query.unanswered ? { answeredAt: null } : {}) };

  const page = query.page ?? 1;
  const readAt = (at: number) =>
    prisma.inquiry.findMany({
      where,
      /*
       * 미답변만 볼 때는 오래 기다린 것부터 꺼낸다. 최신순으로 두면 새
       * 문의가 계속 앞을 막아 오래된 것이 영영 처리되지 않는다.
       */
      orderBy: query.unanswered
        ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: ADMIN_INQUIRY_PAGE_SIZE,
      skip: offsetOf(at, ADMIN_INQUIRY_PAGE_SIZE),
      select: {
        id: true, content: true, isPrivate: true, createdAt: true,
        answer: true, answeredAt: true, answeredById: true,
        answeredBy: { select: { id: true, name: true, role: true, merchantId: true } },
        topic: true,
        product: { select: { id: true, name: true } },
        author: { select: { name: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    });

  const [first, pending, total] = await Promise.all([
    readAt(page),
    prisma.inquiry.count({ where: { ...scoped, answeredAt: null } }),
    prisma.inquiry.count({ where }),
  ]);
  // 미답변만 보기로 좁히면 쪽 수가 줄어든다 — 그때 빈 표 대신 마지막 쪽을 준다
  const rows = await clampToLastPage(first, { page, pageSize: ADMIN_INQUIRY_PAGE_SIZE, total }, readAt);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      productId: row.product?.id ?? null,
      productName: row.product?.name ?? null,
      topic: row.topic,
      // 답할 사람은 비공개 문의도 봐야 한다. 그러라고 있는 자리다.
      content: row.content,
      isPrivate: row.isPrivate,
      authorName: maskAuthor(row.author.name),
      createdAt: row.createdAt,
      answer: row.answer,
      answeredAt: row.answeredAt,
      answeredBy: row.answeredAt === null
        ? null
        // 이 칸이 생기기 전에 단 답은 누가 했는지 적혀 있지 않다
        : actorLabel(actor, { id: row.answeredById, identity: row.answeredBy }, '기록 없음'),
      imageUrls: row.images.map((i) => i.url),
    })),
    total,
    pending,
  };
}

export interface MyInquiryRow {
  readonly id: string;
  readonly content: string;
  readonly isPrivate: boolean;
  readonly topic: InquiryTopic | null;
  readonly productName: string | null;
  readonly productSlug: string | null;
  readonly createdAt: Date;
  readonly answer: string | null;
  readonly answeredAt: Date | null;
  /** 첨부한 사진 주소(1:1 문의) */
  readonly imageUrls: readonly string[];
}

/**
 * 내가 쓴 문의.
 *
 * **상품 문의와 고객센터 문의를 한 줄에 섞어 보여 준다.** 쓴 사람에게는
 * 둘 다 "내가 물어본 것" 이고, 어디에 썼는지로 나눠 두면 답이 어디 왔는지
 * 두 곳을 찾아다니게 된다.
 *
 * 비공개 여부를 여기서는 보지 않는다 — 내 글이다.
 */
/** 내 문의 한 쪽의 줄 수 */
export const MY_INQUIRY_PAGE_SIZE = 10;

/*
 * **다음 쪽으로 갈 길이 없었다.** 커서를 받게 만들어 놓고 화면이 한 번도 넘기지 않아, 열한 번째 문의부터는
 * 볼 수 없었다. 다른 마이페이지 목록과 같이 쪽 번호로 넘긴다.
 */
export async function getMyInquiries(
  userId: string,
  pageNo = 1,
): Promise<{ items: MyInquiryRow[]; total: number }> {
  const where = { authorId: userId, deletedAt: null };
  const read = (at: number) =>
    prisma.inquiry.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: offsetOf(at, MY_INQUIRY_PAGE_SIZE),
      take: MY_INQUIRY_PAGE_SIZE,
      select: {
        id: true, content: true, isPrivate: true, topic: true, createdAt: true,
        answer: true, answeredAt: true,
        product: { select: { name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, select: { url: true } },
      },
    });

  const [first, total] = await Promise.all([read(pageNo), prisma.inquiry.count({ where })]);
  const page = await clampToLastPage(first, { page: pageNo, pageSize: MY_INQUIRY_PAGE_SIZE, total }, read);

  return {
    items: page.map((row) => ({
      id: row.id,
      content: row.content,
      isPrivate: row.isPrivate,
      topic: row.topic,
      productName: row.product?.name ?? null,
      productSlug: row.product?.slug ?? null,
      createdAt: row.createdAt,
      answer: row.answer,
      answeredAt: row.answeredAt,
      imageUrls: row.images.map((i) => i.url),
    })),
    total,
  };
}
