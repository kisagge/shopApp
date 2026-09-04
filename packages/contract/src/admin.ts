import { z } from 'zod';
import { cuidSchema } from './common';

/**
 * 슈퍼관리자 동작 계약 — 입점 승인과 권한 부여.
 *
 * 둘 다 되돌리기 어렵고 다른 사람의 권한을 바꾼다. 이유를 함께 받는 이유는
 * 감사 로그에 "무엇을" 만 남고 "왜" 가 빠지면 나중에 판단할 수 없기 때문이다.
 */

export const MERCHANT_STATUS = ['PENDING', 'APPROVED', 'SUSPENDED', 'TERMINATED'] as const;
export type MerchantStatusInput = (typeof MERCHANT_STATUS)[number];

export const MERCHANT_STATUS_LABEL: Readonly<Record<MerchantStatusInput, string>> = {
  PENDING: '승인 대기',
  APPROVED: '정상',
  SUSPENDED: '일시 정지',
  TERMINATED: '해지',
};

export const updateMerchantStatusSchema = z
  .object({
    status: z.enum(MERCHANT_STATUS),
    reason: z.string().trim().max(300).default(''),
  })
  // 승인은 이유가 없어도 되지만 **불이익을 주는 처분에는 이유를 남긴다.**
  // 정지된 가맹점이 왜 정지됐는지 아무도 모르는 상태가 되면 안 된다.
  .refine((v) => v.status === 'APPROVED' || v.status === 'PENDING' || v.reason.length > 0, {
    message: '정지·해지에는 사유가 필요합니다',
    path: ['reason'],
  });
export type UpdateMerchantStatusInput = z.infer<typeof updateMerchantStatusSchema>;

export const USER_ROLE_INPUT = ['CUSTOMER', 'MERCHANT', 'ADMIN', 'SUPER_ADMIN'] as const;
export type UserRoleInput = (typeof USER_ROLE_INPUT)[number];

export const assignRoleSchema = z
  .object({
    role: z.enum(USER_ROLE_INPUT),
    /** MERCHANT 로 올릴 때만 채운다 */
    merchantId: cuidSchema.nullable().default(null),
    reason: z.string().trim().min(1, '사유를 입력해 주세요').max(300),
  })
  .refine((v) => v.role !== 'MERCHANT' || v.merchantId !== null, {
    // 소속 없는 가맹점 계정은 아무것도 볼 수 없다. hasPermission 이 merchantId
    // 가 비면 false 를 주므로, 만들어 봐야 로그인만 되는 계정이 된다.
    message: '가맹점 계정에는 소속 가맹점이 필요합니다',
    path: ['merchantId'],
  })
  .refine((v) => v.role === 'MERCHANT' || v.merchantId === null, {
    message: '가맹점 계정이 아니면 소속을 비워야 합니다',
    path: ['merchantId'],
  });
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const ADMIN_ERROR = [
  'MERCHANT_NOT_FOUND', 'USER_NOT_FOUND', 'CANNOT_CHANGE_OWN_ROLE',
  'CANNOT_EDIT_SUPER_ADMIN', 'MERCHANT_NOT_APPROVED', 'USER_CLOSED',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR)[number];

export const ADMIN_ERROR_MESSAGE: Readonly<Record<AdminErrorCode, string>> = {
  MERCHANT_NOT_FOUND: '가맹점을 찾을 수 없습니다',
  USER_NOT_FOUND: '회원을 찾을 수 없습니다',
  CANNOT_CHANGE_OWN_ROLE: '자기 권한은 바꿀 수 없습니다',
  CANNOT_EDIT_SUPER_ADMIN: '슈퍼관리자 계정은 수정할 수 없습니다',
  MERCHANT_NOT_APPROVED: '승인되지 않은 가맹점에는 계정을 붙일 수 없습니다',
  USER_CLOSED: '탈퇴한 계정에는 권한을 줄 수 없습니다',
};
