/**
 * 리뷰 신고 규칙. 순수 로직만, I/O 없음.
 *
 * 신고는 **운영진이 먼저 볼 것을 고르는 신호**다. 그 이상은 아니다.
 */

export const REPORT_REASON = ['SPAM', 'ABUSE', 'IRRELEVANT', 'PRIVACY', 'OTHER'] as const;
export type ReportReason = (typeof REPORT_REASON)[number];

export const REPORT_REASON_LABEL: Readonly<Record<ReportReason, string>> = {
  SPAM: '광고 · 도배',
  ABUSE: '욕설 · 비방',
  IRRELEVANT: '상품과 무관한 내용',
  PRIVACY: '개인정보 노출',
  OTHER: '기타',
};

export function isReportReason(value: string): value is ReportReason {
  return (REPORT_REASON as readonly string[]).includes(value);
}

/**
 * **신고가 쌓여도 자동으로 내리지 않는다.**
 *
 * "N건 넘으면 자동 숨김" 은 구현이 쉽고 실제로 흔하지만, 이 도메인에서는
 * 계정 몇 개만 맞추면 **정당한 혹평을 지우는 버튼**이 된다. 경쟁 판매자든
 * 해당 가맹점이든 그렇게 할 이유가 충분하고, 지워진 쪽은 자기 글이 왜
 * 사라졌는지 알 방법이 없다.
 *
 * 그래서 신고는 순서만 바꾼다. 내리는 것은 사람이 정한다.
 */
export const AUTO_HIDE_ON_REPORTS = false;

/** 신고 한 건의 무게. 사유마다 급함이 다르다. */
const REASON_WEIGHT: Readonly<Record<ReportReason, number>> = {
  // 개인정보는 남아 있는 동안 계속 새어 나간다. 다른 사유와 급이 다르다.
  PRIVACY: 100,
  ABUSE: 30,
  SPAM: 10,
  IRRELEVANT: 5,
  OTHER: 5,
};

export interface ReportSignal {
  readonly reason: ReportReason;
}

/**
 * 처리 순서를 정하는 점수. 높을수록 먼저 본다.
 *
 * **같은 사유가 여러 번 쌓이는 것보다 서로 다른 사유가 겹치는 쪽을 위로
 * 올린다.** 같은 사유 10건은 한 사람이 여러 계정으로 눌렀을 수 있지만,
 * 사유가 갈린다는 것은 서로 다른 이유로 눈에 걸렸다는 뜻이다.
 *
 * 그래서 사유별로는 가장 무거운 것 하나만 세고, 나머지 건수는 훨씬 작은
 * 가중치로 더한다 — 건수를 무시하면 진짜 도배를 놓친다.
 */
export function reportPriority(reports: readonly ReportSignal[]): number {
  if (reports.length === 0) return 0;

  const kinds = new Set(reports.map((r) => r.reason));
  let sum = 0;
  for (const reason of kinds) sum += REASON_WEIGHT[reason];

  return sum + reports.length;
}

export type ModerationState = 'clean' | 'reported' | 'kept' | 'removed';

export const MODERATION_STATE_LABEL: Readonly<Record<ModerationState, string>> = {
  clean: '신고 없음',
  reported: '처리 대기',
  kept: '문제없음',
  removed: '내려감',
};

/**
 * 리뷰 하나의 처리 상태.
 *
 * 내려간 글은 신고가 남아 있어도 `removed` 다 — 이미 끝난 건이라 대기줄에
 * 다시 세우면 같은 일을 두 번 처리하게 된다.
 */
export function moderationState(input: {
  readonly removedByModerator: boolean;
  readonly openReports: number;
  readonly totalReports: number;
}): ModerationState {
  if (input.removedByModerator) return 'removed';
  if (input.openReports > 0) return 'reported';
  if (input.totalReports > 0) return 'kept';
  return 'clean';
}

export const REVIEW_REPORT_ERROR = {
  ALREADY_REPORTED: '이미 신고한 리뷰입니다.',
  CANNOT_REPORT_OWN: '내가 쓴 리뷰는 신고할 수 없습니다.',
  REPORT_TARGET_GONE: '이미 사라진 리뷰입니다.',
  NOTHING_TO_DISMISS: '처리할 신고가 없습니다.',
} as const;
export type ReviewReportErrorCode = keyof typeof REVIEW_REPORT_ERROR;
