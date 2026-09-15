import { describe, it, expect } from 'vitest';
import { isMyReturnTurn, returnStageOf, type Actor } from '../src';

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const day = new Date('2026-09-15');

describe('returnStageOf', () => {
  it('신청 → 승인 대기, 승인했는데 물건이 안 왔으면 도착 대기', () => {
    expect(returnStageOf({ type: 'RETURN', status: 'REQUESTED', receivedAt: null })).toBe('REVIEW');
    expect(returnStageOf({ type: 'EXCHANGE', status: 'APPROVED', receivedAt: null })).toBe('AWAIT_ARRIVAL');
  });

  it('물건이 오면 반품은 환불 대기, 교환은 교환 발송 대기', () => {
    expect(returnStageOf({ type: 'RETURN', status: 'APPROVED', receivedAt: day })).toBe('REFUND');
    expect(returnStageOf({ type: 'EXCHANGE', status: 'APPROVED', receivedAt: day })).toBe('RESHIP');
  });

  it('반려·완료는 끝남', () => {
    expect(returnStageOf({ type: 'RETURN', status: 'REJECTED', receivedAt: null })).toBe('DONE');
    expect(returnStageOf({ type: 'RETURN', status: 'COMPLETED', receivedAt: day })).toBe('DONE');
  });
});

describe('isMyReturnTurn', () => {
  it('가맹점은 자기 상품만 든 신청의 승인·도착 확인·교환 발송이 차례다 — 환불은 아니다', () => {
    expect(isMyReturnTurn(merchant, 'REVIEW', ['m-a', 'm-a'])).toBe(true);
    expect(isMyReturnTurn(merchant, 'AWAIT_ARRIVAL', ['m-a'])).toBe(true);
    expect(isMyReturnTurn(merchant, 'RESHIP', ['m-a'])).toBe(true);
    expect(isMyReturnTurn(merchant, 'REFUND', ['m-a']), '가맹점이 스스로 돈을 돌려줄 차례로 보인다').toBe(false);
  });

  it('남의 상품이 섞였으면 가맹점 차례가 아니다 — 운영진 몫이다', () => {
    expect(isMyReturnTurn(merchant, 'REVIEW', ['m-a', 'm-b'])).toBe(false);
    expect(isMyReturnTurn(admin, 'REVIEW', ['m-a', 'm-b'])).toBe(true);
  });

  it('운영진은 환불도 차례고, 끝난 신청은 누구 차례도 아니다', () => {
    expect(isMyReturnTurn(admin, 'REFUND', ['m-a'])).toBe(true);
    expect(isMyReturnTurn(admin, 'DONE', [null])).toBe(false);
  });
});
