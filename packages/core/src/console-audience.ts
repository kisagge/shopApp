/**
 * 처리할 일을 **누가** 들어야 하는가. 순수 로직만.
 *
 * 반품·교환 신청은 줄마다 판매처가 다르다. 가맹점은 **신청한 줄이 전부 자기 상품일 때만** 처리한다
 * (authz canResolveReturnOf) — 그 밖의 신청은 운영진 몫이다. 알림도 같은 선을 따른다: 처리할 수 없는 사람에게
 * 보내면 알림함이 할 수 없는 일로 찬다.
 *
 * - 판매처가 있는 줄의 가맹점은 **늘** 듣는다 — 자기 물건이 돌아온다(처리는 못 해도 알아야 한다)
 * - 자사 상품 줄이 있거나 판매처가 둘 이상이면 운영진이 듣는다 — 그 신청을 처리하는 사람이다
 */
export interface ReturnAudience {
  readonly merchantIds: readonly string[];
  readonly operators: boolean;
}

export function returnAudience(lineMerchantIds: readonly (string | null)[]): ReturnAudience {
  const merchantIds = [...new Set(lineMerchantIds.filter((m): m is string => m !== null))].sort();
  const ownLine = lineMerchantIds.some((m) => m === null);
  return { merchantIds, operators: ownLine || merchantIds.length !== 1 };
}

/**
 * 상품 문의 — 판매처가 있으면 그 가맹점이, 자사 상품이면 운영진이 답한다(authz canAnswerInquiry 와 같다).
 */
export function inquiryAudience(productMerchantId: string | null): ReturnAudience {
  return productMerchantId === null
    ? { merchantIds: [], operators: true }
    : { merchantIds: [productMerchantId], operators: false };
}
