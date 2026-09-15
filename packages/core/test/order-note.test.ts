import { describe, it, expect } from 'vitest';
import { canDeleteOrderNote, canSeeOrderNote, orderNoteMerchantOf, orderNoteScope, type Actor } from '../src';

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const staffNote = { authorId: 'u-admin', merchantId: null };
const aNote = { authorId: 'u-a', merchantId: 'm-a' };

describe('주문 메모를 보는 범위', () => {
  it('운영진은 모두, 가맹점은 자기 가맹점 것만, 손님은 아무것도', () => {
    expect(orderNoteScope(admin)).toBeNull();
    expect(orderNoteScope(merchantA)).toBe('m-a');
    expect(orderNoteScope(customer)).toBeUndefined();

    expect(canSeeOrderNote(admin, aNote)).toBe(true);
    expect(canSeeOrderNote(merchantA, aNote)).toBe(true);
    expect(canSeeOrderNote(merchantA, staffNote), '운영진 상담 메모가 가맹점에게 보였다').toBe(false);
    expect(canSeeOrderNote(merchantB, aNote), '다른 가맹점 메모가 보였다').toBe(false);
    expect(canSeeOrderNote(customer, staffNote)).toBe(false);
  });

  it('남기는 메모에 적히는 가맹점 — 운영진은 비운다', () => {
    expect(orderNoteMerchantOf(admin)).toBeNull();
    expect(orderNoteMerchantOf(merchantA)).toBe('m-a');
  });
});

describe('주문 메모 지우기', () => {
  it('쓴 사람만 지운다 — 운영진도 남의 메모는 못 지운다', () => {
    expect(canDeleteOrderNote(admin, staffNote)).toBe(true);
    expect(canDeleteOrderNote({ ...admin, id: 'u-other' }, staffNote)).toBe(false);
    expect(canDeleteOrderNote(admin, aNote)).toBe(false);
    expect(canDeleteOrderNote(merchantA, aNote)).toBe(true);
  });

  it('계정이 지워져 쓴 사람이 없는 메모는 아무도 못 지운다', () => {
    expect(canDeleteOrderNote(admin, { authorId: null, merchantId: null })).toBe(false);
  });
});
