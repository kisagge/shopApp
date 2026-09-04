import { describe, it, expect } from 'vitest';
import { pushRecent, MAX_RECENT } from '~/stores/recently-viewed';

describe('최근 본 목록에 넣기', () => {
  it('맨 앞에 붙는다 — 최근이 먼저다', () => {
    expect(pushRecent(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('다시 본 상품은 줄이 늘지 않고 자리만 앞으로 온다', () => {
    // 두 번 보이면 "최근 본" 이 아니라 "본 횟수" 가 된다
    expect(pushRecent(['a', 'b', 'c'], 'c')).toEqual(['c', 'a', 'b']);
  });

  it('같은 상품을 계속 봐도 하나다', () => {
    let list: string[] = [];
    for (let i = 0; i < 5; i += 1) list = pushRecent(list, 'a');
    expect(list).toEqual(['a']);
  });

  it('오래된 것부터 밀려난다', () => {
    const full = Array.from({ length: MAX_RECENT }, (_, i) => `s${i}`);
    const next = pushRecent(full, 'new');

    expect(next).toHaveLength(MAX_RECENT);
    expect(next[0]).toBe('new');
    // 가장 오래된 것이 빠진다
    expect(next).not.toContain(`s${MAX_RECENT - 1}`);
  });

  it('상한을 넘겨 받아도 그만큼만 남긴다', () => {
    expect(pushRecent(['a', 'b', 'c'], 'd', 2)).toEqual(['d', 'a']);
  });

  it('원래 목록을 고치지 않는다', () => {
    const before = ['a', 'b'];
    pushRecent(before, 'c');
    expect(before).toEqual(['a', 'b']);
  });
});
