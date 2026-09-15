import { APIError } from 'better-auth/api';
import { NAME_MAX_LENGTH, PHONE_PATTERN } from '@shop/core';

/**
 * 회원정보가 바뀌는 자리에서 **서버가 한 번 더** 본다.
 *
 * 화면은 계약(updateProfileSchema)으로 막고 우리 창구(/api/account/profile)도 같은 계약을 쓰지만, 인증 라이브러리의
 * 사용자 수정 창구(/api/auth/update-user)는 누구나 직접 부를 수 있다 — 거기서는 이름 길이도 연락처 형식도 안 본다.
 * 사용자 수정은 전부 이 훅을 지나므로 여기서 막는다. 들어온 칸만 본다(인증 라이브러리가 이메일 확인 같은 다른 칸을
 * 고칠 때도 이 훅을 지난다).
 */
export function assertProfileUpdate(data: Readonly<Record<string, unknown>>): void {
  if ('name' in data) {
    const name = typeof data['name'] === 'string' ? data['name'].trim() : '';
    if (name.length === 0 || name.length > NAME_MAX_LENGTH) {
      throw new APIError('BAD_REQUEST', { code: 'INVALID_NAME', message: `이름은 1~${NAME_MAX_LENGTH}자입니다.` });
    }
  }
  if ('phone' in data && data['phone'] !== null && data['phone'] !== '') {
    if (typeof data['phone'] !== 'string' || !PHONE_PATTERN.test(data['phone'].trim())) {
      throw new APIError('BAD_REQUEST', { code: 'INVALID_PHONE', message: '휴대폰 번호 형식이 올바르지 않습니다.' });
    }
  }
}
