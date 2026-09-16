import { describe, it, expect } from 'vitest';
import {
  CLIENT_PLATFORM, CLIENT_PLATFORM_LABEL, isClientPlatform, toClientPlatform,
} from '../src/client-platform';

/**
 * 어디서 들어온 방문인가.
 *
 * 앱 웹뷰와 모바일 브라우저가 같은 칸에 섞이면 둘 다 뿌옇게 된다.
 */

describe('플랫폼 말', () => {
  it('셸이 돌려주는 값을 그대로 쓴다', () => {
    // Capacitor 의 getPlatform() 이 돌려주는 말과 같아야 한다 —
    // 다르면 @shop/native 와 여기 사이에 번역표가 하나 생긴다
    expect([...CLIENT_PLATFORM]).toEqual(['web', 'ios', 'android']);
  });

  it('모든 값에 이름이 붙어 있다', () => {
    // 하나라도 빠지면 운영 화면에 빈칸이 뜬다
    for (const p of CLIENT_PLATFORM) {
      expect(CLIENT_PLATFORM_LABEL[p], `${p} 에 이름이 없다`).toBeTruthy();
    }
    expect(Object.keys(CLIENT_PLATFORM_LABEL)).toHaveLength(CLIENT_PLATFORM.length);
  });
});

describe('좁히기', () => {
  it('아는 값은 통과시킨다', () => {
    expect(toClientPlatform('ios')).toBe('ios');
    expect(toClientPlatform('android')).toBe('android');
    expect(toClientPlatform('web')).toBe('web');
  });

  it('모르는 값은 web 으로 접지 않고 버린다', () => {
    /*
     * 접어 버리면 웹 숫자가 조용히 틀어진다. 아무것도 아닌 것으로 두면
     * 최소한 "모른다" 가 남는다.
     */
    expect(toClientPlatform('electron')).toBeNull();
    expect(toClientPlatform('IOS')).toBeNull();
    expect(toClientPlatform('')).toBeNull();
  });

  it('문자열이 아닌 것도 버린다 — 그물 밖에서 오는 값이다', () => {
    expect(toClientPlatform(undefined)).toBeNull();
    expect(toClientPlatform(null)).toBeNull();
    expect(toClientPlatform(1)).toBeNull();
    expect(toClientPlatform({ platform: 'ios' })).toBeNull();
  });

  it('isClientPlatform 은 좁히기와 같은 답을 낸다', () => {
    for (const v of ['web', 'ios', 'android', 'electron', '', 3, null]) {
      expect(isClientPlatform(v)).toBe(toClientPlatform(v) !== null);
    }
  });
});
