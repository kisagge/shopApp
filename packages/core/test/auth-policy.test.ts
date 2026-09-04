import { describe, it, expect } from 'vitest';
import { isDerivedFromEmail, PASSWORD_MIN_LENGTH, SIGNUP_POINTS } from '../src/auth-policy';

describe('비밀번호가 이메일에서 나왔는가', () => {
  it('아이디를 그대로 쓰면 걸린다', () => {
    expect(isDerivedFromEmail('demo1234', 'demo@plain.test')).toBe(true);
  });

  it('아이디를 품고만 있어도 걸린다', () => {
    expect(isDerivedFromEmail('xxdemoxx', 'demo@plain.test')).toBe(true);
  });

  it('대소문자는 무시한다 — 공격자에게는 같은 후보다', () => {
    expect(isDerivedFromEmail('Demo1234', 'demo@plain.test')).toBe(true);
    expect(isDerivedFromEmail('demo1234', 'DEMO@plain.test')).toBe(true);
  });

  it('도메인은 보지 않는다', () => {
    // plain 은 수많은 주소에 들어가는 흔한 조각이라 이것까지 막으면
    // 멀쩡한 비밀번호가 계속 거절당한다
    expect(isDerivedFromEmail('plain-is-good-77', 'demo@plain.test')).toBe(false);
  });

  it('아이디가 두 글자 이하면 보지 않는다', () => {
    // a@x.test 같은 주소에서 "a" 를 막으면 a 가 든 모든 비밀번호가 걸린다
    expect(isDerivedFromEmail('anything', 'ab@plain.test')).toBe(false);
  });

  it('관계없는 비밀번호는 통과한다', () => {
    expect(isDerivedFromEmail('quiet-harbor-42', 'demo@plain.test')).toBe(false);
  });
});

describe('상수', () => {
  it('길이 기준은 Better Auth 설정과 같아야 한다', () => {
    // 여기만 바꾸면 화면은 통과시키고 서버가 거절하는 상태가 된다
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('가입 포인트는 양수다', () => {
    expect(SIGNUP_POINTS).toBeGreaterThan(0);
  });
});
