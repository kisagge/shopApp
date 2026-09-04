import { describe, it, expect } from 'vitest';
import { signUpSchema } from '../src/auth';

const valid = {
  email: 'buyer@plain.test',
  name: '구매자',
  password: 'quiet-harbor-42',
  passwordConfirm: 'quiet-harbor-42',
};

const messageAt = (input: unknown, field: string): string | undefined => {
  const r = signUpSchema.safeParse(input);
  if (r.success) return undefined;
  return r.error.issues.find((i) => i.path[0] === field)?.message;
};

describe('가입 계약', () => {
  it('제대로 채우면 통과한다', () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it('이름의 앞뒤 공백은 걷어낸다', () => {
    const r = signUpSchema.parse({ ...valid, name: '  구매자  ' });
    expect(r.name).toBe('구매자');
  });

  it('공백만 적은 이름은 거절한다 — 걷어내면 빈 값이다', () => {
    expect(messageAt({ ...valid, name: '   ' }, 'name')).toBe('이름을 입력해 주세요');
  });

  it('짧은 비밀번호는 거절한다', () => {
    expect(messageAt({ ...valid, password: 'short7', passwordConfirm: 'short7' }, 'password'))
      .toContain('8자 이상');
  });

  it('확인이 다르면 확인 칸을 가리킨다', () => {
    // 폼 전체 오류로 두면 어느 칸을 고쳐야 하는지 화면이 가리킬 수 없다
    expect(messageAt({ ...valid, passwordConfirm: 'other-value-1' }, 'passwordConfirm'))
      .toBe('비밀번호가 일치하지 않습니다');
  });

  it('이메일에서 나온 비밀번호는 비밀번호 칸을 가리킨다', () => {
    expect(messageAt({ ...valid, password: 'buyer-1234', passwordConfirm: 'buyer-1234' }, 'password'))
      .toContain('이메일과 너무 비슷한');
  });

  it('이메일 형식을 본다', () => {
    expect(messageAt({ ...valid, email: 'not-an-email' }, 'email')).toBeDefined();
  });
});
