import 'server-only';
import { prisma } from '@shop/db';
import { PRODUCT_REPORT_ERROR, type Actor, type ProductReportErrorCode } from '@shop/core';
import type { ReportProductInput } from '@shop/contract';
import { onDisplay, sellableBrand } from '~/lib/queries/catalog/shelf';
import { isUniqueViolation } from '~/lib/db/unique-violation';

export class ProductReportError extends Error {
  constructor(readonly code: ProductReportErrorCode, readonly status = 400) {
    super(PRODUCT_REPORT_ERROR[code]);
    this.name = 'ProductReportError';
  }
}

/**
 * 상품을 신고한다.
 *
 * **매대에 보이는 상품만 신고할 수 있다.** 숨긴 상품까지 열어 두면 두 가지가 생긴다 —
 * 볼 수도 없는 것에 대한 신고가 대기줄에 쌓이고, 아이디를 넣어 보며 **어느 아이디가 있는지
 * 알아내는 창구**가 된다(없으면 404, 있으면 성공). 매대의 조건은 카탈로그 질의가 쓰는
 * 것과 같은 자리에서 가져온다 — 따로 적으면 숨긴 상품이 한쪽에서만 숨는다.
 *
 * 한 사람이 같은 상품을 여러 번 신고할 수 없다. 유니크 제약이 DB 에서도 한 번 더 막는다 —
 * 동시에 두 번 눌리면 여기 검사만으로는 둘 다 통과한다.
 */
export async function reportProduct(
  reporter: Actor,
  productId: string,
  input: ReportProductInput,
): Promise<{ reported: true }> {
  const product = await prisma.product.findFirst({
    where: { id: productId, ...onDisplay(), brand: sellableBrand() },
    select: { id: true, brand: { select: { merchantId: true } } },
  });
  if (!product) throw new ProductReportError('REPORT_TARGET_GONE', 404);

  /*
   * 자기 가맹점 상품은 신고할 수 없다.
   *
   * 막지 않으면 파는 쪽이 자기 상품을 운영 대기줄에 올릴 수 있다. 고칠 길은 이미 있다 —
   * 내용을 고치거나 판매를 멈추는 창구가 콘솔에 있고, 그쪽이 훨씬 빠르다.
   */
  if (reporter.merchantId !== null && product.brand.merchantId === reporter.merchantId) {
    throw new ProductReportError('CANNOT_REPORT_OWN', 403);
  }

  try {
    await prisma.productReport.create({
      data: { productId, reporterId: reporter.id, reason: input.reason, detail: input.detail },
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ProductReportError('ALREADY_REPORTED', 409);
    throw error;
  }

  return { reported: true };
}
