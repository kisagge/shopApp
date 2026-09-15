import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, NAME_MAX_LENGTH, PHONE_PATTERN, isDerivedFromEmail,
} from '@shop/core';

/**
 * 가입 폼 계약.
 *
 * 실제 가입은 Better Auth 가 처리하므로 이 스키마는 **화면이 보내기 전에
 * 지키는 약속**이다. 그래서 비밀번호 확인란처럼 서버에 가지 않는 항목도 함께
 * 검증한다 — 검증이 폼 안에 흩어지면 무엇이 규칙인지 읽을 수가 없다.
 */
export const signUpSchema = z
  .object({
    email: z.email('valid.emailFormat'),
    name: z
      .string()
      .trim()
      .min(1, 'valid.nameRequired')
      .max(NAME_MAX_LENGTH, 'valid.nameTooLong'),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'valid.passwordTooShort')
      .max(PASSWORD_MAX_LENGTH, 'valid.passwordTooLong'),
    passwordConfirm: z.string(),
  })
  /**
   * 확인란 검사를 그 필드에 붙인다.
   *
   * path 를 주지 않으면 폼 전체 오류가 되어 어느 칸을 고쳐야 하는지 화면이
   * 가리킬 수 없다. 스크린리더에서는 특히 그렇다 — 어디로 가야 할지 모른 채
   * "일치하지 않습니다" 만 듣는다.
   */
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'valid.passwordMismatch',
  })
  .refine((v) => !isDerivedFromEmail(v.password, v.email), {
    path: ['password'],
    message: 'valid.passwordLikeEmail',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;

/**
 * 비밀번호 재설정 폼 계약.
 *
 * 여기서는 이메일을 모른다 — 사용자는 메일의 링크로 들어오고 토큰만 들고
 * 온다. 그래서 "이메일과 비슷한가" 검사를 걸 수 없다. 길이와 확인란만 본다.
 */
export const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'valid.passwordTooShort')
      .max(PASSWORD_MAX_LENGTH, 'valid.passwordTooLong'),
    passwordConfirm: z.string(),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    path: ['passwordConfirm'],
    message: 'valid.passwordMismatch',
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** 재설정 메일을 요청하는 폼. */
export const forgotPasswordSchema = z.object({
  email: z.email('valid.emailFormat'),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

/**
 * 회원정보 수정 계약. 이메일은 없다 — 바꾸려면 새 주소 확인이 필요하고, 그 전에는 로그인 주소를 바꿀 수 없다.
 *
 * 연락처는 비워도 된다(빈 칸은 지우기). 적으면 휴대폰 형식이어야 한다 — 배송지 연락처와 같은 규칙이다.
 */
export const updateProfileSchema = z.object({
  name: z
    .string({ error: 'valid.nameRequired' })
    .trim()
    .min(1, 'valid.nameRequired')
    .max(NAME_MAX_LENGTH, 'valid.nameTooLong'),
  phone: z
    .string()
    .trim()
    .max(20, 'valid.tooLongChars')
    .refine((v) => v === '' || PHONE_PATTERN.test(v), 'valid.phoneFormat')
    .default(''),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

/**
 * 비밀번호 변경 폼 계약.
 *
 * 현재 비밀번호를 받는다 — 로그인해 둔 기기를 잠깐 빌린 사람이 비밀번호를 바꿔 계정을 가져가지 못하게. 새 비밀번호가
 * 지금 것과 같으면 막는다(바꾼 줄 알고 끝나는 것을 막는다). 이메일과 비슷한지는 가입과 같은 검사다.
 */
export const changePasswordSchema = z
  .object({
    email: z.string(),
    currentPassword: z.string().min(1, 'valid.currentPasswordRequired'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, 'valid.passwordTooShort')
      .max(PASSWORD_MAX_LENGTH, 'valid.passwordTooLong'),
    newPasswordConfirm: z.string(),
  })
  .refine((v) => v.newPassword === v.newPasswordConfirm, {
    path: ['newPasswordConfirm'],
    message: 'valid.passwordMismatch',
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ['newPassword'],
    message: 'valid.passwordSameAsCurrent',
  })
  .refine((v) => !isDerivedFromEmail(v.newPassword, v.email), {
    path: ['newPassword'],
    message: 'valid.passwordLikeEmail',
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
