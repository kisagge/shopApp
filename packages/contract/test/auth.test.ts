import { describe, it, expect } from 'vitest';
import { signUpSchema, resetPasswordSchema, forgotPasswordSchema } from '../src/auth';

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

describe('재설정 계약', () => {
  const ok = { password: 'quiet-harbor-42', passwordConfirm: 'quiet-harbor-42' };

  it('길이와 확인만 본다 — 여기서는 이메일을 모른다', () => {
    // 사용자는 메일 링크로 들어오고 토큰만 들고 온다
    expect(resetPasswordSchema.safeParse(ok).success).toBe(true);
  });

  it('짧으면 거절한다', () => {
    const r = resetPasswordSchema.safeParse({ password: 'short7', passwordConfirm: 'short7' });
    expect(r.success).toBe(false);
  });

  it('확인이 다르면 확인 칸을 가리킨다', () => {
    const r = resetPasswordSchema.safeParse({ ...ok, passwordConfirm: 'other-value-1' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path[0]).toBe('passwordConfirm');
  });
});

describe('찾기 계약', () => {
  it('이메일 형식만 본다', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@plain.test' }).success).toBe(true);
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});
