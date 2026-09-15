import { describe, it, expect } from 'vitest';
import { archiverOf, checkArchive, type Actor } from '../src';

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };
const live = { deletedAt: null, archivedBy: null };
const byMerchant = { deletedAt: new Date('2026-09-01'), archivedBy: 'MERCHANT' as const };
const byStaff = { deletedAt: new Date('2026-09-01'), archivedBy: 'STAFF' as const };

describe('archiverOf', () => {
  it('운영진은 STAFF, 가맹점은 MERCHANT', () => {
    expect(archiverOf(admin)).toBe('STAFF');
    expect(archiverOf({ id: 's', role: 'SUPER_ADMIN', merchantId: null })).toBe('STAFF');
    expect(archiverOf(merchant)).toBe('MERCHANT');
  });
});

describe('checkArchive', () => {
  it('매대에 있는 상품은 누구든 보관할 수 있고, 이미 보관한 것은 다시 못 한다', () => {
    expect(checkArchive(merchant, 'ARCHIVE', live)).toBeNull();
    expect(checkArchive(admin, 'ARCHIVE', live)).toBeNull();
    expect(checkArchive(admin, 'ARCHIVE', byMerchant)).toBe('ALREADY_ARCHIVED');
  });

  it('보관하지 않은 상품은 되돌릴 것이 없다', () => {
    expect(checkArchive(admin, 'RESTORE', live)).toBe('NOT_ARCHIVED');
  });

  it('가맹점은 자기가 보관한 것만 되돌린다 — 운영진이 내린 상품은 운영진만', () => {
    expect(checkArchive(merchant, 'RESTORE', byMerchant)).toBeNull();
    expect(checkArchive(merchant, 'RESTORE', byStaff)).toBe('RESTORE_NOT_ALLOWED');
    expect(checkArchive(admin, 'RESTORE', byStaff)).toBeNull();
    expect(checkArchive(admin, 'RESTORE', byMerchant)).toBeNull();
  });

  it('보관한 쪽을 모르면 가맹점에게 닫는다', () => {
    expect(checkArchive(merchant, 'RESTORE', { deletedAt: new Date(), archivedBy: null })).toBe('RESTORE_NOT_ALLOWED');
    expect(checkArchive(admin, 'RESTORE', { deletedAt: new Date(), archivedBy: null })).toBeNull();
  });
});
