import { describe, it, expect } from 'vitest';
import { clampPage, offsetOf, pageNav, totalPagesOf, PAGE_WINDOW } from '../src';

/**
 * 쪽 번호.
 *
 * 운영 목록은 훑고 처리하는 자리라 "더 보기" 로만 내려가면 일곱 쪽 뒤로 가려고 여섯 번을 눌러야 한다.
 */

describe('쪽 수', () => {
  it('딱 나누어떨어지면 그 수만큼', () => {
    expect(totalPagesOf(100, 20)).toBe(5);
  });

  it('남으면 한 쪽 더', () => {
    expect(totalPagesOf(101, 20)).toBe(6);
  });

  it('줄이 없어도 1쪽이다 — 0쪽은 화면에 그릴 수 없는 수다', () => {
    expect(totalPagesOf(0, 20)).toBe(1);
  });
});

describe('주소로 들어온 쪽 번호', () => {
  it('범위를 벗어나면 가장 가까운 쪽으로 당긴다', () => {
    // 빈 화면과 "없는 쪽입니다" 보다, 있는 것을 보여 주는 편이 낫다
    expect(clampPage(0, 5)).toBe(1);
    expect(clampPage(-3, 5)).toBe(1);
    expect(clampPage(999, 5)).toBe(5);
  });

  it('숫자가 아니면 첫 쪽이다', () => {
    expect(clampPage('abc', 5)).toBe(1);
    expect(clampPage(undefined, 5)).toBe(1);
    expect(clampPage(null, 5)).toBe(1);
  });

  it('소수는 잘라 낸다', () => {
    expect(clampPage('2.9', 5)).toBe(2);
  });
});

describe('그릴 번호 묶음', () => {
  const nav = (page: number, total = 200, pageSize = 20) => pageNav({ page, total, pageSize });

  it('지금 쪽을 가운데 둔다', () => {
    expect(nav(5).pages).toEqual([3, 4, 5, 6, 7]);
  });

  it('앞쪽 끝에서는 밀어 붙인다 — 폭이 들쭉날쭉하면 누르려던 자리가 움직인다', () => {
    expect(nav(1).pages).toEqual([1, 2, 3, 4, 5]);
    expect(nav(2).pages).toEqual([1, 2, 3, 4, 5]);
  });

  it('뒤쪽 끝에서도 밀어 붙인다', () => {
    expect(nav(10).pages).toEqual([6, 7, 8, 9, 10]);
    expect(nav(9).pages).toEqual([6, 7, 8, 9, 10]);
  });

  it('쪽이 적으면 있는 만큼만 그린다', () => {
    expect(pageNav({ page: 1, total: 40, pageSize: 20 }).pages).toEqual([1, 2]);
  });

  it('줄이 하나도 없으면 1쪽 하나다', () => {
    const empty = pageNav({ page: 1, total: 0, pageSize: 20 });
    expect(empty.pages).toEqual([1]);
    expect(empty.hasPrev).toBe(false);
    expect(empty.hasNext).toBe(false);
  });

  it('앞뒤가 있는지 함께 말한다 — 끝에서 화살표를 링크로 두면 안 된다', () => {
    expect(nav(1)).toMatchObject({ hasPrev: false, hasNext: true });
    expect(nav(10)).toMatchObject({ hasPrev: true, hasNext: false });
    expect(nav(5)).toMatchObject({ hasPrev: true, hasNext: true });
  });

  it('창은 홀수다 — 그래야 지금 쪽이 가운데에 선다', () => {
    expect(PAGE_WINDOW % 2).toBe(1);
  });

  it('벗어난 쪽으로 불러도 있는 쪽을 그린다', () => {
    expect(nav(99).page).toBe(10);
    expect(nav(99).pages).toEqual([6, 7, 8, 9, 10]);
  });
});

describe('건너뛸 줄 수', () => {
  it('첫 쪽은 건너뛰지 않는다', () => {
    expect(offsetOf(1, 20)).toBe(0);
  });

  it('쪽마다 한 묶음씩 건너뛴다', () => {
    expect(offsetOf(3, 20)).toBe(40);
  });
});
