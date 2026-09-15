import 'server-only';
import { prisma } from '@shop/db';
import {
  canAnswerInquiry, canDeleteInquiry,
  INQUIRY_ERROR,
  type Actor, type InquiryErrorCode,
} from '@shop/core';
import type { CreateInquiryInput, AnswerInquiryInput } from '@shop/contract';
import type { UploadedImage } from '~/lib/images/upload-files';

export class InquiryError extends Error {
  constructor(readonly code: InquiryErrorCode, readonly status = 400) {
    super(INQUIRY_ERROR[code]);
    this.name = 'InquiryError';
  }
}

/**
 * 문의 작성.
 *
 * **사기 전에 묻는 자리다.** 그래서 구매 이력을 보지 않는다 — 리뷰와
 * 다른 점이 바로 그것이다. 로그인만 요구한다: 익명으로 열면 누구에게
 * 답해야 하는지 알 수 없고, 답이 왔는지도 알려 줄 수 없다.
 */
export async function createInquiry(userId: string, input: CreateInquiryInput, images: readonly UploadedImage[] = []) {
  // 상품 문의는 공개 Q&A 다 — 사진을 받으면 손님의 물건·집 사진이 상품 화면에 걸린다
  if (images.length > 0 && input.productId != null) throw new InquiryError('IMAGES_SUPPORT_ONLY', 400);

  /*
   * 상품이 붙은 문의만 상품을 확인한다. 고객센터로 들어오는 물음(배송·환불
   * 같은 것)에는 상품이 없다 — 계약이 "상품이나 갈래 중 하나" 를 이미
   * 강제하므로 여기서는 있는 쪽만 본다.
   */
  if (input.productId != null) {
    // 매대에 없는 상품에는 물을 것도 없다
    const product = await prisma.product.findFirst({
      where: { id: input.productId, deletedAt: null },
      select: { id: true },
    });
    if (!product) throw new InquiryError('PRODUCT_NOT_FOUND', 404);
  }

  return prisma.inquiry.create({
    data: {
      productId: input.productId ?? null,
      topic: input.topic ?? null,
      authorId: userId,
      content: input.content,
      isPrivate: input.isPrivate,
      ...(images.length > 0
        ? { images: { createMany: { data: images.map((img, i) => ({ url: img.url, storageKey: img.key, sortOrder: i })) } } }
        : {}),
    },
    select: { id: true, content: true, isPrivate: true, createdAt: true },
  });
}

/** 답변할 문의와 그 상품의 소속. 권한 판단에 둘 다 필요하다. */
async function loadForAnswer(inquiryId: string) {
  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, deletedAt: null },
    select: {
      id: true, authorId: true, answeredAt: true, content: true,
      product: {
        select: {
          id: true, name: true, slug: true,
          brand: { select: { merchantId: true } },
        },
      },
      author: { select: { email: true, name: true, locale: true } },
    },
  });
  if (!inquiry) throw new InquiryError('INQUIRY_NOT_FOUND', 404);
  return inquiry;
}

export interface AnsweredInquiry {
  readonly id: string;
  /** 물어본 사람. 알림을 남길 곳이다. */
  readonly authorId: string;
  /** 상품 없는 문의면 null */
  readonly productName: string | null;
  readonly productSlug: string | null;
  readonly authorEmail: string;
  readonly authorName: string;
  /** 물어본 사람이 고른 말. 답변을 쓴 운영자의 말이 아니다. */
  readonly authorLocale: string | null;
  readonly question: string;
  readonly answer: string;
}

/**
 * 답변.
 *
 * **자기 상품만 답한다.** 가맹점이 남의 상품 문의에 답하면 그 브랜드를
 * 대신 말하는 셈이 된다.
 *
 * 이미 답이 달린 문의는 다시 답하지 않는다 — 답이 조용히 바뀌면 물어본
 * 사람은 자기가 본 것이 무엇이었는지 알 수 없다. 고쳐야 하면 지우고
 * 다시 받는 편이 정직하다.
 */
export async function answerInquiry(
  actor: Actor,
  inquiryId: string,
  input: AnswerInquiryInput,
): Promise<AnsweredInquiry> {
  const inquiry = await loadForAnswer(inquiryId);

  /*
   * 상품이 없으면 **소속도 없다.** 그러면 ownsMerchant 가 가맹점을 걸러
   * 내므로 고객센터 문의는 운영진만 답하게 된다 — 배송·환불은 플랫폼이
   * 정하는 것이라 그것이 맞다. 규칙을 여기 새로 적지 않아도 그렇게 된다.
   */
  const merchantId = inquiry.product?.brand.merchantId ?? null;
  if (!canAnswerInquiry(actor, { merchantId })) {
    throw new InquiryError('NOT_ALLOWED', 403);
  }
  if (inquiry.answeredAt !== null) throw new InquiryError('ALREADY_ANSWERED', 409);

  const updated = await prisma.inquiry.update({
    where: { id: inquiryId },
    data: { answer: input.answer, answeredById: actor.id, answeredAt: new Date() },
    select: { id: true, answer: true },
  });

  return {
    id: updated.id,
    authorId: inquiry.authorId,
    productName: inquiry.product?.name ?? null,
    productSlug: inquiry.product?.slug ?? null,
    authorEmail: inquiry.author.email,
    authorName: inquiry.author.name,
    authorLocale: inquiry.author.locale,
    question: inquiry.content,
    answer: updated.answer ?? input.answer,
  };
}

/**
 * 삭제.
 *
 * 본인이 지우면 행을 없앤다 — 남길 이유가 없다. 운영진이 내리면 표시만
 * 한다: 문제가 되어 내린 글은 분쟁 때 원본이 있어야 한다. 리뷰와 같은
 * 규칙이다.
 */
export async function deleteInquiry(actor: Actor, inquiryId: string): Promise<void> {
  const inquiry = await prisma.inquiry.findFirst({
    where: { id: inquiryId, deletedAt: null },
    select: { id: true, authorId: true },
  });
  if (!inquiry) throw new InquiryError('INQUIRY_NOT_FOUND', 404);
  if (!canDeleteInquiry(actor, inquiry)) throw new InquiryError('NOT_OWN_INQUIRY', 403);

  if (inquiry.authorId === actor.id) {
    await prisma.inquiry.delete({ where: { id: inquiryId } });
  } else {
    await prisma.inquiry.update({
      where: { id: inquiryId },
      data: { deletedAt: new Date() },
    });
  }
}
