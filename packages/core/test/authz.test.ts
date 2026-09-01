import { describe, it, expect } from 'vitest';
import {
  USER_ROLE, USER_ROLE_LABEL, PERMISSION, permissionsOf,
  hasPermission, assertPermission, ForbiddenError,
  ownsMerchant, canManageProduct, canViewOrder, canFulfillOrderItem,
  canRefundOrder, canViewSettlement, canAssignRole, canEditUser, merchantScope,
  type Actor,
} from '../src/authz';

const customer: Actor = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
const merchant: Actor = { id: 'u-2', role: 'MERCHANT', merchantId: 'm-1' };
const otherMerchant: Actor = { id: 'u-3', role: 'MERCHANT', merchantId: 'm-2' };
const orphanMerchant: Actor = { id: 'u-4', role: 'MERCHANT', merchantId: null };
const admin: Actor = { id: 'u-5', role: 'ADMIN', merchantId: null };
const superAdmin: Actor = { id: 'u-6', role: 'SUPER_ADMIN', merchantId: null };

describe('역할과 권한', () => {
  it('모든 역할에 한글 라벨이 있다', () => {
    for (const r of USER_ROLE) expect(USER_ROLE_LABEL[r]).toBeTruthy();
  });

  it('슈퍼관리자는 모든 권한을 가진다', () => {
    expect(permissionsOf('SUPER_ADMIN')).toEqual(PERMISSION);
  });

  it('고객은 어드민 콘솔에 못 들어간다', () => {
    expect(hasPermission(customer, 'admin:access')).toBe(false);
  });

  it('가맹점은 어드민 콘솔에 들어간다 — 자기 상품을 관리해야 한다', () => {
    expect(hasPermission(merchant, 'admin:access')).toBe(true);
  });
});

describe('관리자와 슈퍼관리자의 경계', () => {
  it.each([
    ['user:assignRole', '권한 부여'],
    ['merchant:approve', '가맹점 입점 승인'],
    ['settlement:pay', '정산 지급 집행'],
    // 두 번째 인자(설명)를 받지 않으면 it.each 의 튜플 시그니처와 어긋난다
  ] as const)('관리자는 %s(%s)를 할 수 없다', (permission, _label) => {
    expect(hasPermission(admin, permission)).toBe(false);
    expect(hasPermission(superAdmin, permission)).toBe(true);
  });

  it('관리자도 정산 금액 확정까지는 할 수 있다 — 확정과 지급을 분리한 것이다', () => {
    expect(hasPermission(admin, 'settlement:confirm')).toBe(true);
    expect(hasPermission(admin, 'settlement:pay')).toBe(false);
  });

  it('관리자는 슈퍼관리자 계정을 수정할 수 없다', () => {
    expect(canEditUser(admin, { id: 'x', role: 'SUPER_ADMIN' })).toBe(false);
    expect(canEditUser(admin, { id: 'x', role: 'ADMIN' })).toBe(true);
    expect(canEditUser(superAdmin, { id: 'x', role: 'SUPER_ADMIN' })).toBe(true);
  });

  it('자기 자신의 역할은 바꿀 수 없다', () => {
    expect(canAssignRole(superAdmin, { id: superAdmin.id }, 'CUSTOMER')).toBe(false);
    expect(canAssignRole(superAdmin, { id: 'other' }, 'ADMIN')).toBe(true);
  });
});

describe('소속 없는 가맹점 계정', () => {
  it('아무 권한도 갖지 못한다 — 안전한 쪽으로 닫는다', () => {
    for (const p of PERMISSION) expect(hasPermission(orphanMerchant, p)).toBe(false);
  });

  it('범위 조회에서도 아무것도 못 본다', () => {
    expect(merchantScope(orphanMerchant)).toBeUndefined();
  });
});

describe('가맹점 범위', () => {
  it('자기 브랜드 상품만 고칠 수 있다', () => {
    expect(canManageProduct(merchant, { merchantId: 'm-1' })).toBe(true);
    expect(canManageProduct(merchant, { merchantId: 'm-2' })).toBe(false);
  });

  it('자사 직매입 상품(merchantId=null)은 운영진만 다룬다', () => {
    expect(canManageProduct(merchant, { merchantId: null })).toBe(false);
    expect(canManageProduct(admin, { merchantId: null })).toBe(true);
  });

  it('권한만 있고 범위가 안 맞으면 거부된다', () => {
    // hasPermission 은 통과하지만 소유권에서 걸린다
    expect(hasPermission(otherMerchant, 'product:write')).toBe(true);
    expect(canManageProduct(otherMerchant, { merchantId: 'm-1' })).toBe(false);
  });

  it('자기 정산만 볼 수 있다', () => {
    expect(canViewSettlement(merchant, { merchantId: 'm-1' })).toBe(true);
    expect(canViewSettlement(merchant, { merchantId: 'm-2' })).toBe(false);
    expect(canViewSettlement(admin, { merchantId: 'm-2' })).toBe(true);
  });

  it('목록 쿼리 범위 — 운영진은 제한 없음, 가맹점은 자기 것으로', () => {
    expect(merchantScope(admin)).toBeNull();
    expect(merchantScope(superAdmin)).toBeNull();
    expect(merchantScope(merchant)).toBe('m-1');
    expect(merchantScope(customer)).toBeUndefined();
  });
});

describe('주문 조회 범위', () => {
  const order = { userId: 'u-1', itemMerchantIds: ['m-1', 'm-2'] };

  it('고객은 자기 주문만 본다', () => {
    expect(canViewOrder(customer, order)).toBe(true);
    expect(canViewOrder({ ...customer, id: 'u-99' }, order)).toBe(false);
  });

  it('가맹점은 자기 상품이 한 줄이라도 들어간 주문을 본다', () => {
    expect(canViewOrder(merchant, order)).toBe(true);
    expect(canViewOrder({ id: 'u-9', role: 'MERCHANT', merchantId: 'm-9' }, order)).toBe(false);
  });

  it('운영진은 모든 주문을 본다', () => {
    expect(canViewOrder(admin, order)).toBe(true);
    expect(canViewOrder(superAdmin, order)).toBe(true);
  });

  it('가맹점은 자기 줄만 출고 처리한다', () => {
    expect(canFulfillOrderItem(merchant, { merchantId: 'm-1' })).toBe(true);
    expect(canFulfillOrderItem(merchant, { merchantId: 'm-2' })).toBe(false);
  });

  it('환불은 가맹점이 못 한다 — 돈이 나가는 동작이다', () => {
    expect(canRefundOrder(merchant)).toBe(false);
    expect(canRefundOrder(admin)).toBe(true);
  });
});

describe('assertPermission', () => {
  it('없는 권한이면 역할 이름이 담긴 에러를 던진다', () => {
    expect(() => assertPermission(customer, 'admin:access')).toThrow(ForbiddenError);
    expect(() => assertPermission(customer, 'admin:access')).toThrow(/고객/);
  });

  it('있는 권한이면 조용히 통과한다', () => {
    expect(() => assertPermission(admin, 'order:refund')).not.toThrow();
  });
});
