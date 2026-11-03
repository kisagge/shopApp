/**
 * 상품 신고 규칙. 순수 로직만, I/O 없음.
 *
 * 리뷰 신고와 **다른 집합을 쓴다.** 글을 신고하는 말(도배·욕설·관련 없음)로는 파는 물건을
 * 가리킬 수 없고, 반대로 짝퉁·금지 품목은 글에 쓸 말이 아니다. 한 집합으로 묶으면 화면이
 * 고를 수 없는 사유를 보여 주거나, 코드가 "대상이 상품이면 이 사유만" 을 매번 가리게 된다.
 */

export const PRODUCT_REPORT_REASON = [
  'COUNTERFEIT',
  'PROHIBITED',
  'WRONG_INFO',
  'UNSAFE',
  'OTHER',
] as const;
export type ProductReportReason = (typeof PRODUCT_REPORT_REASON)[number];

/*
 * 이름표는 여기 없다 — 무엇이 있는지는 규칙이고 뭐라고 부를지는 화면이다.
 * `apps/web` 의 `lib/i18n/enum-labels` 가 이 목록에서 열쇠를 만들고 사전이 세 벌로 가진다.
 * 리뷰 신고 사유와 같은 결이다.
 */

export function isProductReportReason(value: string): value is ProductReportReason {
  return (PRODUCT_REPORT_REASON as readonly string[]).includes(value);
}

/**
 * **신고가 쌓여도 자동으로 내리지 않는다.**
 *
 * 리뷰에서 같은 결론에 닿았는데, 상품 쪽은 이유가 하나 더 있다 — **내려가는 것이 남의
 * 매출이다.** 계정 몇 개로 경쟁 브랜드의 잘 팔리는 상품을 대기줄에 올려 자동으로 내릴 수
 * 있다면, 신고는 신호가 아니라 무기가 된다. 내리는 것은 사람이 정한다.
 */
export const AUTO_ARCHIVE_ON_REPORTS = false;

/**
 * 신고 한 건의 무게. 사유마다 급함이 다르다.
 *
 * **법과 안전이 먼저다.** 금지 품목과 안전 문제는 팔리는 동안 계속 커지고 우리가 책임을
 * 진다. 짝퉁은 그다음 — 브랜드와 손님 둘에게 피해가 가지만 되돌릴 수 있다. 설명이 실제와
 * 다른 것은 고치면 되는 일이라 가장 낮다.
 */
const REASON_WEIGHT: Readonly<Record<ProductReportReason, number>> = {
  PROHIBITED: 100,
  UNSAFE: 100,
  COUNTERFEIT: 40,
  WRONG_INFO: 10,
  OTHER: 5,
};

export interface ProductReportSignal {
  readonly reason: ProductReportReason;
}

/**
 * 처리 순서를 정하는 점수. 높을수록 먼저 본다.
 *
 * **같은 사유가 여러 번 쌓이는 것보다 서로 다른 사유가 겹치는 쪽을 위로 올린다.** 같은 사유
 * 10건은 한 사람이 여러 계정으로 눌렀을 수 있지만, 사유가 갈린다는 것은 서로 다른 이유로
 * 눈에 걸렸다는 뜻이다. 리뷰 신고가 먼저 그렇게 정했고 까닭은 여기서도 같다.
 *
 * 그래서 사유별로는 가장 무거운 것 하나만 세고 건수는 훨씬 작은 가중치로 더한다 — 건수를
 * 아예 무시하면 진짜 도배를 놓친다.
 */
export function productReportPriority(reports: readonly ProductReportSignal[]): number {
  if (reports.length === 0) return 0;

  const kinds = new Set(reports.map((r) => r.reason));
  let sum = 0;
  for (const reason of kinds) sum += REASON_WEIGHT[reason];

  return sum + reports.length;
}

/**
 * 상품 하나의 처리 상태.
 *
 * **내려간 상품은 신고가 남아 있어도 `archived` 다** — 이미 끝난 건이라 대기줄에 다시
 * 세우면 같은 일을 두 번 처리하게 된다. 리뷰의 `moderationState` 와 같은 모양이고, 이름만
 * 이 도메인의 말을 쓴다(글은 내려가고 상품은 보관된다).
 */
export type ProductReportState = 'clean' | 'reported' | 'kept' | 'archived';

export function productReportState(input: {
  readonly archived: boolean;
  readonly openReports: number;
  readonly totalReports: number;
}): ProductReportState {
  if (input.archived) return 'archived';
  if (input.openReports > 0) return 'reported';
  if (input.totalReports > 0) return 'kept';
  return 'clean';
}

/**
 * 처리 결과로 적는 값. DB 에는 글자로 남는다 — 무엇을 적을지는 여기서 정한다.
 *
 * 파생 타입(`ProductReportResolution`)은 **쓰는 자리가 생길 때** 만든다. 운영 처리 창구가
 * 아직 없는데 미리 내보내면 아무도 부르지 않는 export 가 되고, `dead-exports` 가 그것을
 * 잡는다 — 실제로 잡혔다.
 */
export const PRODUCT_REPORT_RESOLUTION = ['kept', 'archived'] as const;

export const PRODUCT_REPORT_ERROR = {
  ALREADY_REPORTED: 'err.productReport.already',
  CANNOT_REPORT_OWN: 'err.productReport.cannotReportOwn',
  REPORT_TARGET_GONE: 'err.productReport.targetGone',
  // 운영 화면에서만 나는 것이라 한국어로 둔다 — 신고를 닫는 자리다
  NOTHING_TO_RESOLVE: '처리할 신고가 없습니다.',
} as const;
export type ProductReportErrorCode = keyof typeof PRODUCT_REPORT_ERROR;
