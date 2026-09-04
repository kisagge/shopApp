import { describe, it, expect } from 'vitest';
import { negotiateLocale, resolveLocale, isLocale, LOCALES, DEFAULT_LOCALE } from '../src/locale';

describe('Accept-Language 협상', () => {
  it('헤더가 없으면 고르지 않는다', () => {
    expect(negotiateLocale(null)).toBeNull();
    expect(negotiateLocale('')).toBeNull();
  });

  it('지역 코드가 붙어 와도 알아본다', () => {
    expect(negotiateLocale('ja-JP')).toBe('ja');
    expect(negotiateLocale('en-GB')).toBe('en');
    expect(negotiateLocale('ko-KR')).toBe('ko');
  });

  it('대소문자를 가리지 않는다', () => {
    expect(negotiateLocale('JA-JP')).toBe('ja');
  });

  it('품질값이 높은 쪽을 고른다 — 앞에 있는 것이 아니라', () => {
    // 크롬이 실제로 보내는 모양이다. 앞만 잘라 쓰면 여기서 en 이 된다.
    expect(negotiateLocale('en-US;q=0.8,ja;q=0.9')).toBe('ja');
  });

  it('품질값이 같으면 적힌 순서를 따른다', () => {
    expect(negotiateLocale('ja,en')).toBe('ja');
  });

  it('모르는 말은 건너뛰고 아는 말을 찾는다', () => {
    expect(negotiateLocale('zh-CN,de;q=0.9,en;q=0.5')).toBe('en');
  });

  it('아는 말이 하나도 없으면 null 이다 — 여기서 기본값을 정하지 않는다', () => {
    expect(negotiateLocale('zh-CN,de-DE')).toBeNull();
  });

  it('q=0 은 "이 말은 싫다" 는 뜻이라 고르지 않는다', () => {
    expect(negotiateLocale('ja;q=0,en;q=0.5')).toBe('en');
  });

  it('* 로는 정하지 않는다 — "아무거나" 는 협상이 아니다', () => {
    expect(negotiateLocale('*')).toBeNull();
  });

  it('망가진 q 는 없는 것으로 본다', () => {
    // NaN 이 정렬에 들어가면 순서가 뒤집힌다
    expect(negotiateLocale('en;q=abc,ja;q=0.4')).toBe('ja');
  });
});

describe('이번 요청의 언어', () => {
  it('고른 적이 있으면 브라우저 설정을 이긴다', () => {
    expect(resolveLocale({ cookie: 'ko', acceptLanguage: 'ja-JP' })).toBe('ko');
  });

  it('고른 적이 없으면 브라우저 설정을 따른다', () => {
    expect(resolveLocale({ acceptLanguage: 'ja-JP,en;q=0.9' })).toBe('ja');
  });

  it('아무 단서도 없으면 한국어다', () => {
    expect(resolveLocale({})).toBe(DEFAULT_LOCALE);
    expect(resolveLocale({})).toBe('ko');
  });

  it('쿠키를 고쳐 넣어도 아는 값만 받는다', () => {
    // 사용자가 고칠 수 있는 값이다. 그대로 사전 열쇠로 쓰면 undefined 가 된다.
    expect(resolveLocale({ cookie: '../../etc/passwd', acceptLanguage: 'ja' })).toBe('ja');
    expect(resolveLocale({ cookie: 'zh' })).toBe('ko');
  });

  it('아는 값 목록이 곧 판정 기준이다', () => {
    for (const l of LOCALES) expect(isLocale(l)).toBe(true);
    expect(isLocale('zh')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
