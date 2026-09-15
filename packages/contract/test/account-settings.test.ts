import { describe, it, expect } from 'vitest';
import { updateProfileSchema, changePasswordSchema } from '../src';

/** 회원정보 수정·비밀번호 변경 계약 */
describe('updateProfileSchema', () => {
  it('이름은 앞뒤 공백을 지우고 1~30자, 연락처는 비우거나 휴대폰 형식', () => {
    expect(updateProfileSchema.parse({ name: '  홍길동 ', phone: '010 1234 5678' })).toEqual({ name: '홍길동', phone: '010 1234 5678' });
    expect(updateProfileSchema.parse({ name: '홍길동' })).toEqual({ name: '홍길동', phone: '' });
    const bad = updateProfileSchema.safeParse({ name: ' ', phone: '02-123-4567' });
    expect(bad.error?.issues.map((i) => [i.path[0], i.message])).toEqual([
      ['name', 'valid.nameRequired'],
      ['phone', 'valid.phoneFormat'],
    ]);
    expect(updateProfileSchema.safeParse({ name: '가'.repeat(31) }).error?.issues[0]?.message).toBe('valid.nameTooLong');
  });
});

describe('changePasswordSchema', () => {
  const base = { email: 'kim@plain.test', currentPassword: 'old-pass-123', newPassword: 'quiet-harbor-42', newPasswordConfirm: 'quiet-harbor-42' };
  const issues = (v: Record<string, string>) =>
    changePasswordSchema.safeParse({ ...base, ...v }).error?.issues.map((i) => [i.path[0], i.message]) ?? [];

  it('정상이면 통과한다', () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it('지금 비밀번호가 비었거나, 확인이 다르거나, 지금과 같거나, 이메일과 비슷하면 그 칸에 알린다', () => {
    expect(issues({ currentPassword: '' })).toContainEqual(['currentPassword', 'valid.currentPasswordRequired']);
    expect(issues({ newPasswordConfirm: 'different-42' })).toEqual([['newPasswordConfirm', 'valid.passwordMismatch']]);
    expect(issues({ newPassword: 'old-pass-123', newPasswordConfirm: 'old-pass-123' })).toEqual([['newPassword', 'valid.passwordSameAsCurrent']]);
    expect(issues({ newPassword: 'kim12345', newPasswordConfirm: 'kim12345' })).toContainEqual(['newPassword', 'valid.passwordLikeEmail']);
    expect(issues({ newPassword: 'short', newPasswordConfirm: 'short' })).toContainEqual(['newPassword', 'valid.passwordTooShort']);
  });
});
