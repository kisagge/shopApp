import { describe, it, expect } from 'vitest';
import {
  carrierOf, isCarrierCode, normalizeTrackingNumber, isTrackingNumberLike,
  trackingUrlFor, formatTrackingNumber, CARRIERS,
} from '../src/carrier';

describe('송장번호 정리', () => {
  it('사람이 옮겨 적은 모양을 숫자만 남겨 통일한다', () => {
    expect(normalizeTrackingNumber('1234-5678-9012')).toBe('123456789012');
    expect(normalizeTrackingNumber('1234 5678 9012')).toBe('123456789012');
    expect(normalizeTrackingNumber('123456789012')).toBe('123456789012');
  });

  it('보기 좋게 4자리씩 끊는다 — 옮겨 적을 때 덜 틀린다', () => {
    expect(formatTrackingNumber('123456789012')).toBe('1234-5678-9012');
    expect(formatTrackingNumber('1234567890')).toBe('1234-5678-90');
  });
});

describe('송장번호 형식', () => {
  it('택배사별 자릿수를 못 박지 않는다 — 멀쩡한 번호를 막으면 출고가 멈춘다', () => {
    expect(isTrackingNumberLike('123456789')).toBe(true); // 9자리
    expect(isTrackingNumberLike('12345678901234567890')).toBe(true); // 20자리
  });

  it('너무 짧거나 길면 오타다', () => {
    expect(isTrackingNumberLike('12345678')).toBe(false);
    expect(isTrackingNumberLike('123456789012345678901')).toBe(false);
    expect(isTrackingNumberLike('')).toBe(false);
  });

  it('하이픈이 섞여 있어도 숫자로 센다', () => {
    expect(isTrackingNumberLike('1234-5678-9012')).toBe(true);
  });
});

describe('조회 주소', () => {
  it('송장번호를 끼워 넣는다', () => {
    const url = trackingUrlFor('CJ', '1234-5678-9012');
    expect(url).toContain('123456789012');
    expect(url).not.toContain('{n}');
    expect(url).not.toContain('-');
  });

  it('기타 택배사는 링크를 만들지 않는다 — 어디로 보낼지 모르면서 걸면 안 된다', () => {
    expect(trackingUrlFor('ETC', '123456789012')).toBeNull();
  });

  it('모르는 택배사도 null', () => {
    expect(trackingUrlFor('DHL', '123456789012')).toBeNull();
  });

  it('번호가 없으면 null', () => {
    expect(trackingUrlFor('CJ', '')).toBeNull();
    expect(trackingUrlFor('CJ', '없음')).toBeNull();
  });

  it('번호를 주소에 그대로 이어 붙이지 않는다', () => {
    // 숫자만 남기므로 주입할 여지가 없다
    expect(trackingUrlFor('CJ', '1&foo=bar23456789')).toBe(
      'https://trace.cjlogistics.com/next/tracking.html?wblNo=123456789',
    );
  });
});

describe('택배사 목록', () => {
  it('코드로 찾는다', () => {
    expect(carrierOf('CJ')?.name).toBe('CJ대한통운');
    expect(carrierOf('없는코드')).toBeNull();
  });

  it('아는 코드만 받는다', () => {
    expect(isCarrierCode('CJ')).toBe(true);
    expect(isCarrierCode('DHL')).toBe(false);
  });

  it('모든 조회 주소에 {n} 자리가 있다 — 없으면 번호가 안 들어간다', () => {
    for (const c of CARRIERS) {
      if (c.trackingUrl) expect(c.trackingUrl).toContain('{n}');
    }
  });

  it('링크는 전부 https 다', () => {
    for (const c of CARRIERS) {
      if (c.trackingUrl) expect(c.trackingUrl.startsWith('https://')).toBe(true);
    }
  });
});
