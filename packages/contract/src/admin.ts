import { z } from 'zod';
import {
  MERCHANT_STATUS, merchantStatusNeedsReason, POINT_ADJUST_DIRECTION, POINT_ADJUST_MAX, POINT_ADJUST_NOTE_MAX, type MerchantStatus,
} from '@shop/core';
import { cuidSchema } from './common';

/**
 * 슈퍼관리자 동작 계약 — 입점 승인과 권한 부여.
 *
 * 둘 다 되돌리기 어렵고 다른 사람의 권한을 바꾼다. 이유를 함께 받는 이유는
 * 감사 로그에 "무엇을" 만 남고 "왜" 가 빠지면 나중에 판단할 수 없기 때문이다.
 */

/** 목록 자체는 core 에 있다 — 여기서 다시 내보내면 화면이 계약을 통해 가져가게 된다 */
export type MerchantStatusInput = MerchantStatus;

export const updateMerchantStatusSchema = z
  .object({
    status: z.enum(MERCHANT_STATUS),
    reason: z.string().trim().max(300, 'valid.tooLongChars').default(''),
  })
  // 어느 처분에 이유가 필요한지는 **core 가 정한다.** 여기와 운영 화면이 각자
  // `SUSPENDED · TERMINATED` 를 적어 두고 있었는데, 상태가 하나 늘 때 한쪽만
  // 고치면 화면은 사유를 안 받고 서버가 튕긴다.
  .refine((v) => !merchantStatusNeedsReason(v.status) || v.reason.length > 0, {
    message: 'valid.suspendNeedsReason',
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
    reason: z.string().trim().min(1, 'valid.reasonRequired').max(300, 'valid.tooLongChars'),
  })
  .refine((v) => v.role !== 'MERCHANT' || v.merchantId !== null, {
    // 소속 없는 가맹점 계정은 아무것도 볼 수 없다. hasPermission 이 merchantId
    // 가 비면 false 를 주므로, 만들어 봐야 로그인만 되는 계정이 된다.
    message: 'valid.merchantNeedsScope',
    path: ['merchantId'],
  })
  .refine((v) => v.role === 'MERCHANT' || v.merchantId === null, {
    message: 'valid.nonMerchantNoScope',
    path: ['merchantId'],
  });
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const ADMIN_ERROR = [
  'MERCHANT_NOT_FOUND', 'USER_NOT_FOUND', 'CANNOT_CHANGE_OWN_ROLE',
  'CANNOT_EDIT_SUPER_ADMIN', 'MERCHANT_NOT_APPROVED', 'USER_CLOSED',
  'MERCHANT_STATUS_NOT_ALLOWED',
  'CHANGED_MEANWHILE', 'CANNOT_SUSPEND_SELF', 'CANNOT_SUSPEND_STAFF', 'ALREADY_SUSPENDED', 'NOT_SUSPENDED',
  'POINTS_USER_CLOSED', 'INSUFFICIENT_POINTS',
] as const;
export type AdminErrorCode = (typeof ADMIN_ERROR)[number];

export const ADMIN_ERROR_MESSAGE: Readonly<Record<AdminErrorCode, string>> = {
  MERCHANT_NOT_FOUND: '가맹점을 찾을 수 없습니다',
  USER_NOT_FOUND: '회원을 찾을 수 없습니다',
  CANNOT_CHANGE_OWN_ROLE: '자기 권한은 바꿀 수 없습니다',
  CANNOT_EDIT_SUPER_ADMIN: '슈퍼관리자 계정은 수정할 수 없습니다',
  MERCHANT_NOT_APPROVED: '승인되지 않은 가맹점에는 계정을 붙일 수 없습니다',
  /*
   * 장사하던 가맹점을 '반려' 하거나, 끝난 줄(해지·반려)을 되살리려 했다.
   * 다시 들어오려면 새로 신청해야 한다 — 끝난 줄을 되살리면 그때의 판단이 지워진다.
   */
  MERCHANT_STATUS_NOT_ALLOWED: '지금 상태에서 바꿀 수 없는 상태입니다',
  USER_CLOSED: '탈퇴한 계정에는 권한을 줄 수 없습니다',
  /*
   * 읽은 뒤 쓰기 전에 대상이 바뀌었다.
   *
   * 권한 검사는 **읽은 시점의 값**으로 한다. 그 사이에 대상이 슈퍼관리자가
   * 되면, 슈퍼관리자를 못 건드리게 막아 둔 검사를 그대로 지나쳐 강등된다.
   * 그래서 쓸 때 조건을 함께 걸고, 안 맞으면 여기로 온다.
   */
  CHANGED_MEANWHILE: '그 사이 대상이 바뀌었습니다. 다시 확인하고 시도해 주세요',
  // 스스로를 막으면 풀어 줄 사람을 찾아야 한다. 막으려던 게 아니라 실수다
  CANNOT_SUSPEND_SELF: '자기 계정은 정지할 수 없습니다',
  CANNOT_SUSPEND_STAFF: '운영진 계정은 슈퍼관리자만 정지할 수 있습니다',
  ALREADY_SUSPENDED: '이미 이용이 정지된 계정입니다',
  NOT_SUSPENDED: '정지되지 않은 계정입니다',
  POINTS_USER_CLOSED: '탈퇴한 계정의 포인트는 조정할 수 없습니다',
  INSUFFICIENT_POINTS: '차감할 포인트가 지금 잔액보다 많습니다',
};

/**
 * 적립금 수동 지급·차감.
 *
 * `key` 는 화면이 폼마다 하나 만들어 보낸다 — 지급을 두 번 누르거나 응답을 못 받고 다시 보내도 **한 번만** 나간다.
 */
export const adjustPointsSchema = z.object({
  direction: z.enum(POINT_ADJUST_DIRECTION),
  amount: z.int('valid.integerOnly').min(1, 'valid.tooSmall').max(POINT_ADJUST_MAX, 'valid.tooBig'),
  note: z
    .string({ error: 'valid.reasonRequired' })
    .trim()
    .min(1, 'valid.reasonRequired')
    .max(POINT_ADJUST_NOTE_MAX, 'valid.tooLongChars'),
  key: z.string().regex(/^[A-Za-z0-9-]{16,64}$/, 'valid.idFormat'),
});
export type AdjustPointsInput = z.infer<typeof adjustPointsSchema>;

/**
 * 회원 이용 정지·해제.
 *
 * **정지는 사유 없이 못 한다.** 감사 로그에 남고, 당사자가 문의하면 그 사유로 답한다. 해제는 사유를 받지
 * 않는다 — 막힌 것을 푸는 데 이유를 묻느라 풀어 주지 못하면 안 된다.
 */
export const suspendUserSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('SUSPEND'),
    reason: z
      .string({ error: 'valid.reasonRequired' })
      .trim()
      .min(1, 'valid.reasonRequired')
      .max(300, 'valid.tooLongChars'),
  }),
  z.object({ action: z.literal('RESTORE') }),
]);
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
