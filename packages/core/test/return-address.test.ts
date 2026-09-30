import { describe, it, expect } from 'vitest';
import {
  canEditReturnAddress, linesOfRequest, missingReturnAddresses, normalizeReturnAddress,
  returnAddressChanged, returnAddressLine, returnDestinations,
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

/**
 * 신청에 담긴 줄.
 *
 * **이 규칙을 세 곳이 각자 적고 있었다** — 손님 화면의 보낼 곳, 운영의 처리, 그리고 반품지가 바뀐 것을
 * 누구에게 알릴지. 한 곳만 고치면 세 화면이 서로 다른 줄을 두고 이야기한다.
 */
describe('신청에 담긴 줄', () => {
  const line = (over: Partial<{ id: string; status: string; canceledAt: Date | null }> = {}) => ({
    id: 'i-1', status: 'RETURN_REQUESTED', canceledAt: null, ...over,
  });

  it('고른 줄이 있으면 그 줄만이다', () => {
    const items = [line(), line({ id: 'i-2' })];
    expect(linesOfRequest(items, { itemIds: ['i-2'] }).map((l) => l.id)).toEqual(['i-2']);
  });

  /** 줄별 반품이 생기기 전의 신청은 itemIds 가 비어 있다 — 그때는 반품접수인 줄 전부다 */
  it('옛 신청(줄 없음)은 반품접수인 줄 전부다', () => {
    const items = [line(), line({ id: 'i-2', status: 'DELIVERED' })];
    expect(linesOfRequest(items, { itemIds: [] }).map((l) => l.id)).toEqual(['i-1']);
  });

  it('옛 신청에서 취소된 줄은 뺀다 — 돈이 이미 돌아갔다', () => {
    const items = [line(), line({ id: 'i-2', canceledAt: new Date() })];
    expect(linesOfRequest(items, { itemIds: [] }).map((l) => l.id)).toEqual(['i-1']);
  });

  /** 고른 줄은 그대로 믿는다 — 처리 쪽이 이미 그 줄로 상태를 옮겨 두었다 */
  it('고른 줄이면 상태를 다시 묻지 않는다', () => {
    const items = [line({ status: 'RETURNED' })];
    expect(linesOfRequest(items, { itemIds: ['i-1'] })).toHaveLength(1);
  });
});

/**
 * 반품지가 실제로 달라졌는가.
 *
 * **같은 값을 다시 저장한 것은 알릴 일이 아니다.** 반품지 화면은 저장해도 폼이 남아 있어 같은 값을 두 번
 * 누르기 쉽다 — 그때마다 손님에게 "보낼 곳이 바뀌었습니다" 가 가면, 정작 바뀐 날의 알림을 아무도 믿지 않는다.
 */
describe('반품지가 달라졌는가', () => {
  const addr: ReturnAddress = {
    recipient: '반품담당', phone: '010-0000-0101', postalCode: '04799',
    address1: '서울 성동구 성수이로 00', address2: '1층',
  };

  it('한 칸이라도 다르면 달라진 것이다', () => {
    expect(returnAddressChanged(addr, { ...addr, address2: '2층' })).toBe(true);
    expect(returnAddressChanged(addr, { ...addr, recipient: '반품2팀' })).toBe(true);
  });

  it('같으면 아니다', () => {
    expect(returnAddressChanged(addr, { ...addr })).toBe(false);
  });

  /** 반품지가 없으면 승인할 수 없다 — 그 전에 이 주소로 보내라고 안내받은 사람은 없다 */
  it('처음 등록한 것은 달라진 것이 아니다', () => {
    expect(returnAddressChanged(null, addr)).toBe(false);
  });

  it('빈 글자와 없음은 같게 본다', () => {
    expect(returnAddressChanged({ ...addr, address2: null }, { ...addr, address2: '' })).toBe(false);
  });
});
