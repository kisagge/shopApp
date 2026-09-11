import type { UserRole } from './authz';

/**
 * 입점 신청 규칙. 순수 로직만, I/O 없음.
 *
 * `merchant:approve` 는 운영진이 상태를 바꾸는 데만 쓰였다 — 승인 흐름의
 * **뒷부분만 있고 앞부분이 없었다.** 가맹점이 스스로 신청할 입구가 없어
 * 계정과 브랜드를 운영진이 대신 만들어 줘야 했다.
 */

/**
 * 사업자등록번호 표기.
 *
 * **형식만 본다.** 진짜인지 확인하려면 국세청 진위확인을 불러야 하는데,
 * 그건 사업자 계정이 있어야 발급되는 키를 요구한다 — 이 프로젝트가
 * 가질 수 없는 것이다. 없는 것을 있는 척하지 않는다.
 *
 * 체크섬(마지막 자리 검증)도 넣지 않았다. 넣으면 아무 번호나 넣어 볼 수
 * 없어 시연이 막히는데, 형식만 보는 것보다 나아지는 것은 오타를 조금 더
 * 잡는 정도다. 필요해지면 그때 넣는다.
 */
export const BUSINESS_NUMBER_PATTERN = /^\d{3}-\d{2}-\d{5}$/;

/** 하이픈이 없거나 공백이 섞인 입력을 표준 표기로 맞춘다 */
export function normalizeBusinessNumber(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 10) return value.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

export function isBusinessNumber(value: string): boolean {
  return BUSINESS_NUMBER_PATTERN.test(normalizeBusinessNumber(value));
}

/**
 * 신청할 수 있는 사람인가.
 *
 * **고객만 신청한다.** 가맹점은 이미 계정이 있고, 운영진이 자기 입점을
 * 신청하면 심사하는 사람과 받는 사람이 같아진다 — 승인을 나눠 둔 뜻이
 * 없어진다.
 */
export function canApplyAsMerchant(role: UserRole): boolean {
  return role === 'CUSTOMER';
}

/**
 * 브랜드 주소에 쓸 슬러그.
 *
 * 한글 이름이면 라틴 문자가 남지 않는다. 그때는 부르는 쪽이 대체 값을
 * 만들어야 하므로 **빈 문자열을 돌려준다** — 여기서 임의로 지어내면
 * 어디서 온 주소인지 알 수 없는 값이 생긴다.
 */
export function brandSlugOf(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * 가맹점 상태.
 *
 * 계약(@shop/contract)에 있던 것을 여기로 옮겼다. **값 목록이지 주고받는
 * 모양이 아니다.** 계약은 Zod 를 안고 있어서, 화면이 이 목록 하나를 쓰려고
 * 계약을 가져오면 Zod 384KB 가 브라우저 번들에 딸려 들어온다.
 * 계약은 이 목록으로 스키마를 만들고, 화면은 목록만 가져간다.
 */
export const MERCHANT_STATUS = ['PENDING', 'APPROVED', 'SUSPENDED', 'TERMINATED'] as const;
export type MerchantStatus = (typeof MERCHANT_STATUS)[number];

/**
 * 아직 살아 있는 신청 — 이 상태면 다시 낼 수 없다.
 *
 * **해지(TERMINATED)만 빠진다.** 해지된 경우는 다시 낼 수 있어야 한다 —
 * 고쳐서 다시 오는 길을 막으면 반려가 곧 영구 거절이 된다.
 *
 * **목록에서 빼는 쪽으로 적는다.** `['PENDING', 'APPROVED', 'SUSPENDED']` 라고
 * 적으면 상태가 하나 늘 때 조용히 빠진다 — 새 상태가 '살아 있는 것' 인데도
 * 재신청이 열린다. 빼는 것만 적으면 새 상태는 저절로 '살아 있는 것' 이 되고,
 * 그것이 틀렸다면 여기를 고치게 된다.
 *
 * 화면과 서버가 각자 `['PENDING', 'APPROVED', 'SUSPENDED']` 를 적고 있었다.
 * 값이 같아서 조용했지만 둘 중 하나만 고치면 어긋난다.
 */
const CLOSED_STATUS: readonly MerchantStatus[] = ['TERMINATED'];

export const OPEN_MERCHANT_STATUS: readonly MerchantStatus[] = MERCHANT_STATUS.filter(
  (s) => !CLOSED_STATUS.includes(s),
);

export const isOpenApplication = (status: MerchantStatus): boolean =>
  OPEN_MERCHANT_STATUS.includes(status);

export const MERCHANT_STATUS_LABEL: Readonly<Record<MerchantStatus, string>> = {
  PENDING: '승인 대기',
  APPROVED: '정상',
  SUSPENDED: '일시 정지',
  TERMINATED: '해지',
};

export const MERCHANT_APPLICATION_ERROR = {
  ALREADY_MERCHANT: '이미 가맹점 계정입니다.',
  NOT_APPLICABLE: '고객 계정만 입점을 신청할 수 있습니다.',
  ALREADY_APPLIED: '이미 심사 중인 신청이 있습니다.',
  NAME_TAKEN: '같은 이름의 가맹점이 이미 있습니다.',
  BUSINESS_NUMBER_TAKEN: '이미 등록된 사업자등록번호입니다.',
  BRAND_NAME_TAKEN: '같은 이름의 브랜드가 이미 있습니다.',
  APPLICANT_GONE: '신청자 계정을 찾을 수 없습니다.',
} as const;
export type MerchantApplicationErrorCode = keyof typeof MERCHANT_APPLICATION_ERROR;
