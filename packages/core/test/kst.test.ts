import { describe, it, expect } from 'vitest';
import { kstDate, kstDayIndex } from '../src/kst';

/**
 * **한국 달력** — 날이 바뀌는 자리를 이 두 함수가 혼자 정한다.
 *
 * 같은 두 줄이 `point-expiry` 와 `expiry-notice` 에 각자 적혀 있었다. 주문이 기다린 날을 세는
 * 자리가 생기면서 세 번째 사본이 될 차례였고, 그래서 한곳으로 모았다 — 모았으니 경계를 여기서
 * 한 번 못 박는다. 날이 바뀌는 순간이 한 곳에서만 틀리면 아무도 못 찾는다.
 */
describe('KST 달력', () => {
  it('자정 직전과 직후는 다른 날이다', () => {
    const before = new Date('2026-10-08T23:59:59+09:00');
    const after = new Date('2026-10-09T00:00:00+09:00');

    expect(kstDayIndex(after) - kstDayIndex(before)).toBe(1);
    expect(kstDate(before)).toBe('2026-10-08');
    expect(kstDate(after)).toBe('2026-10-09');
  });

  /** UTC 로 세면 하루가 어긋난다 — 한국의 오전 9시 전이 전날이 되어 버린다 */
  it('한국 오전은 UTC 로는 전날이지만 같은 날로 센다', () => {
    const morning = new Date('2026-10-09T08:00:00+09:00'); // UTC 로는 10-08
    const evening = new Date('2026-10-09T20:00:00+09:00');

    expect(kstDate(morning)).toBe('2026-10-09');
    expect(kstDayIndex(morning)).toBe(kstDayIndex(evening));
  });

  it('하루 차이는 늘 1이다', () => {
    const at = new Date('2026-10-09T12:00:00+09:00');
    const next = new Date(at.getTime() + 24 * 60 * 60 * 1000);

    expect(kstDayIndex(next) - kstDayIndex(at)).toBe(1);
  });
});
