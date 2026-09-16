import { describe, it, expect } from 'vitest';
import {
  consentSatisfied, daysUntilEffective, isPolicyKind, marketingOptedIn, missingConsent,
  policyInEffect, POLICY_PATH, REQUIRED_CONSENT,
} from '../src';

const at = (iso: string) => new Date(iso);

describe('policyInEffect', () => {
  it('시행일이 지났으면 효력이 있다', () => {
    expect(policyInEffect({ effectiveAt: at('2026-01-01T00:00:00+09:00') }, at('2026-01-02T00:00:00+09:00'))).toBe(true);
  });

  it('시행일 당일 0시부터 효력이 있다 — 그날 아침은 이미 새 방침이다', () => {
    expect(policyInEffect({ effectiveAt: at('2026-03-01T00:00:00+09:00') }, at('2026-03-01T00:00:00+09:00'))).toBe(true);
  });

  it('앞날로 올린 문서는 아직 예고다 — 그동안 효력을 갖는 것은 지난 방침이다', () => {
    expect(policyInEffect({ effectiveAt: at('2026-03-01T00:00:00+09:00') }, at('2026-02-20T00:00:00+09:00'))).toBe(false);
  });
});

describe('daysUntilEffective', () => {
  it('시행 전이면 남은 날을 센다 — 화면이 "며칠 뒤부터" 라고 말한다', () => {
    expect(daysUntilEffective({ effectiveAt: at('2026-03-08T00:00:00+09:00') }, at('2026-03-01T00:00:00+09:00'))).toBe(7);
  });

  it('효력이 있으면 셀 것이 없다', () => {
    expect(daysUntilEffective({ effectiveAt: at('2026-01-01T00:00:00+09:00') }, at('2026-03-01T00:00:00+09:00'))).toBeNull();
  });
});

describe('가입 동의', () => {
  it('필수 둘을 다 받아야 가입이다', () => {
    expect(consentSatisfied({ terms: true, privacy: true })).toBe(true);
    expect(consentSatisfied({ terms: true, privacy: false })).toBe(false);
    expect(consentSatisfied({})).toBe(false);
  });

  it('마케팅 수신은 안 해도 가입이 된다 — 선택을 필수로 묶으면 동의가 아니라 대가다', () => {
    expect(consentSatisfied({ terms: true, privacy: true, marketing: false })).toBe(true);
    expect(REQUIRED_CONSENT).not.toContain('marketing');
  });

  it('빠진 필수 항목을 짚어 준다 — 화면이 어느 칸을 가리킬지 정한다', () => {
    expect(missingConsent({ terms: true, marketing: true })).toEqual(['privacy']);
    expect(missingConsent({ terms: true, privacy: true })).toEqual([]);
  });
});

describe('문서 주소와 종류', () => {
  it('종류마다 주소가 하나다 — 푸터·가입·결제가 같은 값을 본다', () => {
    expect(POLICY_PATH.TERMS).toBe('/terms');
    expect(POLICY_PATH.PRIVACY).toBe('/privacy');
  });

  it('아는 종류만 받는다 — 주소 조각을 그대로 믿지 않는다', () => {
    expect(isPolicyKind('TERMS')).toBe(true);
    expect(isPolicyKind('terms')).toBe(false);
    expect(isPolicyKind('COOKIES')).toBe(false);
  });
});

describe('marketingOptedIn', () => {
  it('시각이 있으면 동의한 것, 없으면 아니다', () => {
    expect(marketingOptedIn({ marketingAgreedAt: at('2026-01-01T00:00:00Z') })).toBe(true);
    expect(marketingOptedIn({ marketingAgreedAt: null })).toBe(false);
  });
});
