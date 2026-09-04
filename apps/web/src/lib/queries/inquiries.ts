import 'server-only';
import { prisma } from '@shop/db';
import {
  canReadInquiry, canAnswerInquiry, assertPermission,
  PRIVATE_INQUIRY_PLACEHOLDER,
  type Actor,
} from '@shop/core';

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
  /** 내용을 볼 수 있는가. 못 보면 content 는 대체 문구다. */
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

  const rows = await prisma.productInquiry.findMany({
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
        content: readable ? row.content : PRIVATE_INQUIRY_PLACEHOLDER,
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
  readonly productId: string;
  readonly productName: string;
  readonly content: string;
  readonly isPrivate: boolean;
  readonly authorName: string;
  readonly createdAt: Date;
  readonly answer: string | null;
  readonly answeredAt: Date | null;
}

/**
 * 운영진·가맹점의 문의 목록.
 *
 * 가맹점은 자기 브랜드 상품의 문의만 본다 — 답할 수 있는 것만 보여야
 * 목록이 할 일 목록이 된다.
 */
export async function getAdminInquiries(
  actor: Actor,
  query: { unanswered?: boolean; cursor?: string | undefined } = {},
): Promise<{ rows: AdminInquiryRow[]; nextCursor: string | null; pending: number }> {
  assertPermission(actor, 'inquiry:answer');

  const scoped = {
    deletedAt: null,
    ...(actor.merchantId ? { product: { brand: { merchantId: actor.merchantId } } } : {}),
  };
  const where = { ...scoped, ...(query.unanswered ? { answeredAt: null } : {}) };

  const [rows, pending] = await Promise.all([
    prisma.productInquiry.findMany({
      where,
      /*
       * 미답변만 볼 때는 오래 기다린 것부터 꺼낸다. 최신순으로 두면 새
       * 문의가 계속 앞을 막아 오래된 것이 영영 처리되지 않는다.
       */
      orderBy: query.unanswered
        ? [{ createdAt: 'asc' as const }, { id: 'asc' as const }]
        : [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
      take: 26,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, content: true, isPrivate: true, createdAt: true,
        answer: true, answeredAt: true,
        product: { select: { id: true, name: true } },
        author: { select: { name: true } },
      },
    }),
    prisma.productInquiry.count({ where: { ...scoped, answeredAt: null } }),
  ]);

  const hasMore = rows.length > 25;
  const page = hasMore ? rows.slice(0, 25) : rows;

  return {
    rows: page.map((row) => ({
      id: row.id,
      productId: row.product.id,
      productName: row.product.name,
      // 답할 사람은 비공개 문의도 봐야 한다. 그러라고 있는 자리다.
      content: row.content,
      isPrivate: row.isPrivate,
      authorName: maskAuthor(row.author.name),
      createdAt: row.createdAt,
      answer: row.answer,
      answeredAt: row.answeredAt,
    })),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    pending,
  };
}
