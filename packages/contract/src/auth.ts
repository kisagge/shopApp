import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH, PASSWORD_MAX_LENGTH, NAME_MAX_LENGTH, isDerivedFromEmail,
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
    email: z.email('이메일 주소를 정확히 입력해 주세요'),
    name: z
      .string()
      .trim()
      .min(1, '이름을 입력해 주세요')
      .max(NAME_MAX_LENGTH, `이름은 ${NAME_MAX_LENGTH}자를 넘을 수 없습니다`),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다`)
      .max(PASSWORD_MAX_LENGTH, `비밀번호는 ${PASSWORD_MAX_LENGTH}자를 넘을 수 없습니다`),
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
    message: '비밀번호가 일치하지 않습니다',
  })
  .refine((v) => !isDerivedFromEmail(v.password, v.email), {
    path: ['password'],
    message: '이메일과 너무 비슷한 비밀번호는 쓸 수 없습니다',
  });

export type SignUpInput = z.infer<typeof signUpSchema>;
