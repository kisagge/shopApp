import { describe, it, expect } from 'vitest';
import {
  canEditReturnAddress, missingReturnAddresses, normalizeReturnAddress, returnAddressLine, returnDestinations,
  showsReturnAddress, type Actor, type ReturnAddress,
} from '../src';

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const superAdmin: Actor = { id: 'u-super', role: 'SUPER_ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

const address = (recipient: string): ReturnAddress => ({
  recipient, phone: '010-0000-0101', postalCode: '04799', address1: '서울 성동구 성수이로 00', address2: '1층',
});

describe('normalizeReturnAddress', () => {
  it('연락처를 한 모양으로 맞추고 앞뒤 공백을 턴다', () => {
    expect(normalizeReturnAddress({
      recipient: ' 반품담당 ', phone: '01000000101', postalCode: ' 04799 ', address1: ' 서울 성동구 성수이로 00 ',
    })).toEqual({
      recipient: '반품담당', phone: '010-0000-0101', postalCode: '04799', address1: '서울 성동구 성수이로 00', address2: null,
    });
  });

  it('빈 상세주소는 null 이다 — 빈 문자열로 저장하면 화면에 공백이 붙는다', () => {
    expect(normalizeReturnAddress({ ...address('반품담당'), address2: '   ' }).address2).toBeNull();
  });
});

describe('returnAddressLine', () => {
  it('우편번호를 앞에 둔다 — 송장에 옮겨 적는 순서다', () => {
    expect(returnAddressLine(address('반품담당'))).toBe('(04799) 서울 성동구 성수이로 00 1층');
  });

  it('상세주소가 없으면 붙이지 않는다', () => {
    expect(returnAddressLine({ ...address('반품담당'), address2: null })).toBe('(04799) 서울 성동구 성수이로 00');
  });
});

describe('returnDestinations', () => {
  const lines = [
    { id: 'i-1', merchantId: 'm-a' },
    { id: 'i-2', merchantId: null },
    { id: 'i-3', merchantId: 'm-a' },
  ];

  it('판매처별로 묶는다 — 상자를 나눠 보내야 하기 때문이다', () => {
    const found = returnDestinations(lines, (id) => address(id ?? '자사'));
    expect(found).toHaveLength(2);
    expect(found[0]).toMatchObject({ merchantId: 'm-a', itemIds: ['i-1', 'i-3'] });
    expect(found[1]).toMatchObject({ merchantId: null, itemIds: ['i-2'] });
  });

  it('자사 상품 줄은 플랫폼 반품지를 받는다 — 가맹점 id 가 null 로 온다', () => {
    const asked: (string | null)[] = [];
    returnDestinations(lines, (id) => {
      asked.push(id);
      return null;
    });
    expect(asked).toEqual(['m-a', null]);
  });

  it('반품지가 없는 판매처를 짚어 준다 — 그 신청은 승인할 수 없다', () => {
    const found = returnDestinations(lines, (id) => (id === 'm-a' ? address('스튜디오눈') : null));
    expect(missingReturnAddresses(found)).toEqual([null]);
    expect(missingReturnAddresses(returnDestinations(lines, () => address('어디든')))).toEqual([]);
  });
});

describe('showsReturnAddress', () => {
  it('승인했고 아직 안 왔을 때만 — 승인 전에 보여 주면 반려될 물건을 먼저 보낸다', () => {
    expect(showsReturnAddress({ status: 'APPROVED', receivedAt: null })).toBe(true);
    expect(showsReturnAddress({ status: 'REQUESTED', receivedAt: null })).toBe(false);
    expect(showsReturnAddress({ status: 'REJECTED', receivedAt: null })).toBe(false);
    expect(showsReturnAddress({ status: 'APPROVED', receivedAt: new Date('2026-09-15') })).toBe(false);
  });
});

describe('canEditReturnAddress', () => {
  it('가맹점은 자기 반품지만 고친다 — 남의 것을 고치면 그 가게로 갈 물건이 온다', () => {
    expect(canEditReturnAddress(merchant, 'm-a')).toBe(true);
    expect(canEditReturnAddress(merchant, 'm-b')).toBe(false);
  });

  it('운영진은 가맹점 반품지를 고친다 — 가맹점이 바뀐 창고를 알려 오는 일이 있다', () => {
    expect(canEditReturnAddress(admin, 'm-a')).toBe(true);
  });

  it('자사 상품 반품지는 배송 정책을 정하는 사람만 — 한 가맹점의 일이 아니다', () => {
    expect(canEditReturnAddress(admin, null)).toBe(true);
    expect(canEditReturnAddress(superAdmin, null)).toBe(true);
    expect(canEditReturnAddress(merchant, null)).toBe(false);
  });

  it('손님은 어느 쪽도 못 고친다', () => {
    expect(canEditReturnAddress(customer, 'm-a')).toBe(false);
    expect(canEditReturnAddress(customer, null)).toBe(false);
  });
});
