import { describe, it, expect } from 'vitest';
import { isLive, hasValidWindow, publishStatus } from '../src/schedule';

const at = (iso: string) => new Date(iso);
const item = (over: Partial<{ isActive: boolean; startsAt: Date | null; endsAt: Date | null }> = {}) => ({
  isActive: true,
  startsAt: null,
  endsAt: null,
  ...over,
});

describe('게시 기간', () => {
  it('끈 것은 기간과 무관하게 안 나온다', () => {
    expect(isLive(item({ isActive: false }), at('2026-01-01T00:00:00Z'))).toBe(false);
  });

  it('기간이 없으면 늘 나온다', () => {
    expect(isLive(item(), at('2030-01-01T00:00:00Z'))).toBe(true);
  });

  it('시작 시각은 포함한다', () => {
    const startsAt = at('2026-03-01T00:00:00Z');
    expect(isLive(item({ startsAt }), startsAt)).toBe(true);
  });

  it('종료 시각은 제외한다 — 포함하면 하루를 더 노출한다', () => {
    const endsAt = at('2026-03-01T00:00:00Z');
    expect(isLive(item({ endsAt }), endsAt)).toBe(false);
    expect(isLive(item({ endsAt }), at('2026-02-28T23:59:59Z'))).toBe(true);
  });

  it('뒤집힌 기간은 저장 전에 걸러야 한다', () => {
    expect(hasValidWindow({ startsAt: at('2026-03-02'), endsAt: at('2026-03-01') })).toBe(false);
    expect(hasValidWindow({ startsAt: at('2026-03-01'), endsAt: at('2026-03-02') })).toBe(true);
    expect(hasValidWindow({ startsAt: null, endsAt: at('2026-03-01') })).toBe(true);
  });
});

describe('왜 안 보이는가', () => {
  it.each([
    ['사람이 껐다', { isActive: false }, 'PAUSED'],
    ['아직 시작 전', { startsAt: at('2026-05-01T00:00:00Z') }, 'SCHEDULED'],
    ['이미 끝났다', { endsAt: at('2026-01-01T00:00:00Z') }, 'ENDED'],
    ['지금 노출 중', {}, 'LIVE'],
  ])('%s → %s', (_label, over, expected) => {
    expect(publishStatus(item(over), at('2026-03-01T00:00:00Z'))).toBe(expected);
  });

  it('꺼져 있으면 기간보다 먼저 그것을 말한다 — 켜는 것이 먼저다', () => {
    const ended = item({ isActive: false, endsAt: at('2026-01-01T00:00:00Z') });
    expect(publishStatus(ended, at('2026-03-01T00:00:00Z'))).toBe('PAUSED');
  });
});
