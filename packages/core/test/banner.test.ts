import { describe, it, expect } from 'vitest';
import { isBannerLive, hasValidWindow, bannerStatus, isBannerTone } from '../src/banner';

const NOW = new Date('2026-09-01T12:00:00Z');
const base = { isActive: true, startsAt: null, endsAt: null };

describe('노출 여부', () => {
  it('기간 제한이 없으면 노출한다', () => {
    expect(isBannerLive(base, NOW)).toBe(true);
  });

  it('꺼 두면 기간과 무관하게 안 나온다', () => {
    expect(isBannerLive({ ...base, isActive: false }, NOW)).toBe(false);
  });

  it('시작 전이면 안 나온다', () => {
    expect(isBannerLive({ ...base, startsAt: new Date('2026-09-02T00:00:00Z') }, NOW)).toBe(false);
  });

  it('시작 시각 정각부터 나온다 — 시작은 포함', () => {
    expect(isBannerLive({ ...base, startsAt: NOW }, NOW)).toBe(true);
  });

  it('종료 시각 정각에는 이미 안 나온다 — 종료는 제외', () => {
    // 포함시키면 "9월 1일까지" 기획전이 하루를 통째로 더 노출된다
    expect(isBannerLive({ ...base, endsAt: NOW }, NOW)).toBe(false);
  });

  it('기간 안이면 나온다', () => {
    expect(isBannerLive({
      ...base,
      startsAt: new Date('2026-08-01T00:00:00Z'),
      endsAt: new Date('2026-10-01T00:00:00Z'),
    }, NOW)).toBe(true);
  });
});

describe('기간 유효성', () => {
  it('한쪽만 있으면 통과', () => {
    expect(hasValidWindow({ startsAt: NOW, endsAt: null })).toBe(true);
    expect(hasValidWindow({ startsAt: null, endsAt: NOW })).toBe(true);
  });

  it('시작이 종료보다 뒤면 거절 — 아무 때도 안 나온다', () => {
    expect(hasValidWindow({
      startsAt: new Date('2026-10-01T00:00:00Z'),
      endsAt: new Date('2026-09-01T00:00:00Z'),
    })).toBe(false);
  });

  it('시작과 종료가 같아도 거절 — 길이가 0이다', () => {
    expect(hasValidWindow({ startsAt: NOW, endsAt: NOW })).toBe(false);
  });
});

describe('어드민 상태 표시', () => {
  it.each([
    ['노출 중', base, 'LIVE'],
    ['사람이 끔', { ...base, isActive: false }, 'PAUSED'],
    ['시작 전', { ...base, startsAt: new Date('2026-12-01T00:00:00Z') }, 'SCHEDULED'],
    ['끝남', { ...base, endsAt: new Date('2026-01-01T00:00:00Z') }, 'ENDED'],
  ] as const)('%s → %s', (_label, banner, expected) => {
    // "활성/비활성" 만 보여 주면 왜 안 나오는지 운영자가 알 수 없다
    expect(bannerStatus(banner, NOW)).toBe(expected);
  });

  it('꺼 둔 것이 예정보다 먼저 판정된다', () => {
    expect(bannerStatus(
      { isActive: false, startsAt: new Date('2026-12-01T00:00:00Z'), endsAt: null },
      NOW,
    )).toBe('PAUSED');
  });
});

describe('톤', () => {
  it('정의된 톤만 받는다', () => {
    expect(isBannerTone('sand')).toBe(true);
    expect(isBannerTone('neon')).toBe(false);
  });
});
