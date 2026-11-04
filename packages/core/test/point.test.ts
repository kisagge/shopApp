import { describe, it, expect } from 'vitest';
import { POINT_REASON, isPointReason } from '../src/point';

/**
 * 포인트가 오간 이유.
 *
 * **이 모듈에는 검사가 없었다.** 집합이 DB 와 같은지는 `packages/db` 의 정합성 검사가
 * 보는데(이름 규칙으로 짝을 찾는다), **들어온 글자가 우리 것인지 가르는 함수**는 아무도
 * 부르지 않았다. 그 함수가 늘 참을 돌려주게 되어도 지는 검사가 없었다.
 *
 * 가르는 자리는 운영자가 포인트를 손으로 조정하는 창구다 — 거기서 모르는 이유가 통과하면
 * 원장에 분류할 수 없는 줄이 남고, 소멸·만료 집계가 그 줄을 어느 쪽으로도 세지 못한다.
 */
describe('포인트 이유 가르기', () => {
  it.each(POINT_REASON)('%s 는 우리 이유다', (reason) => {
    expect(isPointReason(reason)).toBe(true);
  });

  it.each([
    ['빈 글자', ''],
    ['소문자', 'earn_purchase'],
    ['앞뒤 공백', ' EARN_PURCHASE '],
    ['모르는 이름', 'EARN_EVENT'],
  ])('%s 는 아니다', (_label, value) => {
    expect(isPointReason(value)).toBe(false);
  });

  /**
   * **글자가 아닌 것도 받는다** — 서명이 `unknown` 이다. 창구는 JSON 을 그대로 넘기므로
   * 숫자·객체·`null` 이 올 수 있고, 그때 `includes` 에 닿기 전에 걸러야 한다.
   */
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['숫자', 1],
    ['객체', { reason: 'EARN_PURCHASE' }],
    ['배열', ['EARN_PURCHASE']],
  ])('%s 는 아니다', (_label, value) => {
    expect(isPointReason(value)).toBe(false);
  });
});
