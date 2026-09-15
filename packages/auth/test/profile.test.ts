import { describe, it, expect } from 'vitest';
import { assertProfileUpdate } from '../src/profile';

/**
 * 회원정보 수정의 서버 쪽 마지막 선. 인증 라이브러리의 사용자 수정 창구를 직접 불러도 여기를 지난다.
 */
describe('assertProfileUpdate', () => {
  it('정상 이름·연락처는 통과하고, 연락처를 비우는 것도 된다', () => {
    expect(() => assertProfileUpdate({ name: '장바구니 손님', phone: '010-1234-5678' })).not.toThrow();
    expect(() => assertProfileUpdate({ phone: '' })).not.toThrow();
    expect(() => assertProfileUpdate({ phone: null })).not.toThrow();
  });

  it('빈 이름·너무 긴 이름은 400 으로 막는다', () => {
    expect(() => assertProfileUpdate({ name: '   ' })).toThrow(expect.objectContaining({ statusCode: 400 }));
    expect(() => assertProfileUpdate({ name: '가'.repeat(31) })).toThrow(expect.objectContaining({ body: expect.objectContaining({ code: 'INVALID_NAME' }) }));
  });

  it('휴대폰 형식이 아니면 막는다', () => {
    expect(() => assertProfileUpdate({ phone: '02-123-4567' })).toThrow(expect.objectContaining({ body: expect.objectContaining({ code: 'INVALID_PHONE' }) }));
    expect(() => assertProfileUpdate({ phone: 12345 })).toThrow();
  });

  it('들어오지 않은 칸은 보지 않는다 — 이메일 확인 같은 다른 수정도 이 훅을 지난다', () => {
    expect(() => assertProfileUpdate({ emailVerified: true })).not.toThrow();
  });
});
