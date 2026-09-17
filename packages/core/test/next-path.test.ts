import { describe, it, expect } from 'vitest';
import { safeNextPath } from '../src/next-path';

/**
 * 로그인 뒤에 돌아갈 곳 — 우리 사이트 안의 경로만.
 *
 * 구글 로그인은 한동안 주소에 실린 next 를 거르지 않고 location.assign 에 넘겼다. 우리 로그인 화면을
 * 거쳐 남의 사이트로 보내는 열린 리디렉트다.
 */

describe('받는 것', () => {
  it.each([
    '/',
    '/checkout',
    '/checkout?now=1',
    '/mypage/orders?page=2#top',
    '/product/%EC%BD%94%ED%8A%B8',
  ])('%s', (path) => {
    expect(safeNextPath(path)).toBe(path);
  });
});

describe('홈으로 돌리는 것', () => {
  it.each([
    ['없다', undefined],
    ['문자열이 아니다', 42],
    ['비었다', ''],
    ['다른 사이트', 'https://evil.test/login'],
    ['프로토콜 없는 다른 사이트 — 브라우저가 다른 호스트로 읽는다', '//evil.test'],
    ['역슬래시 — 일부 브라우저가 // 로 고쳐 읽는다', '/\\evil.test'],
    ['스크립트', 'javascript:alert(1)'],
    ['경로가 아니다', 'checkout'],
    ['줄바꿈으로 주소를 쪼갠다', '/checkout\r\nLocation: https://evil.test'],
    ['너무 길다', `/${'a'.repeat(600)}`],
  ])('%s', (_label, value) => {
    expect(safeNextPath(value)).toBe('/');
  });

  it('로그인 화면으로 되돌아가지 않는다 — 돌고 돈다', () => {
    expect(safeNextPath('/login')).toBe('/');
    expect(safeNextPath('/login?next=/checkout')).toBe('/');
  });

  it('로그인으로 시작하는 다른 화면은 막지 않는다', () => {
    expect(safeNextPath('/loginhelp')).toBe('/loginhelp');
  });
});
