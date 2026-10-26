import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

/**
 * 한 회원의 적립금 잔액과 원장 — 조정하기 전에 보는 자리.
 *
 * **두 번 주는 것을 막으려고 있는 화면이다.** 이미 보상을 받았는지, 반품 회수로 빠졌는지 모르고 주면 두 번 준다.
 * 그래서 원장의 **차례**가 이 조회의 일이다. 그런데 차례를 가르는 뒤 열쇠(`id desc`)가 없어도 아무 검사도 지지
 * 않았다 — 한 거래에서 만든 항목은 `createdAt` 이 같아서, 그때 지급과 차감이 뒤집혀 보인다.
 *
 * 잔액은 원장을 더해 내지 않는다. 원장은 최근 것만 잘라 오므로 더하면 틀린다.
 */

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>() },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { getAdminPointAccount } = await import('~/lib/queries/admin/points');

const admin: Actor = { id: 'u-admin', role: 'ADMIN', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-1' };

/** 같은 시각에 든 두 줄 — 한 거래가 지급과 차감을 함께 남긴 모양이다 */
const SAME_TIME = new Date('2026-10-20T03:00:00Z');
const LEDGER = [
  { id: 'p-2', amount: -500, reason: 'ADJUST', note: '중복 지급 회수', createdAt: SAME_TIME, expiresAt: null },
  { id: 'p-1', amount: 1_000, reason: 'REVIEW', note: null, createdAt: SAME_TIME, expiresAt: new Date('2027-10-20T03:00:00Z') },
];

const USER = {
  id: 'u-1',
  name: '김손님',
  email: 'kim@plain.test',
  pointBalance: 12_300,
  deletedAt: null,
  pointHistory: LEDGER,
};

const arg = () => db.user.findUnique.mock.calls[0]?.[0];

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(USER);
});

describe('적립금 원장을 볼 수 있는 사람', () => {
  it('가맹점은 못 본다 — user:read 가 없다', async () => {
    await expect(getAdminPointAccount(merchant, 'u-1')).rejects.toThrow(/user:read/);
  });

  it('막힌 조회는 DB 를 치지 않는다', async () => {
    await expect(getAdminPointAccount(merchant, 'u-1')).rejects.toThrow();
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('조회만 하는 권한으로도 본다 — 지급·차감은 다른 권한이다', async () => {
    /*
     * 주는 것(point:adjust)과 보는 것(user:read)을 나눠 두었다. 보는 것까지 조정 권한을 묻게 되면
     * 조정 전에 원장을 확인하라는 말이 "조정할 수 있는 사람만 확인할 수 있다" 가 된다.
     */
    await expect(getAdminPointAccount(admin, 'u-1')).resolves.not.toBeNull();
  });
});

describe('없는 회원', () => {
  it('null 을 준다 — 던지지 않는다', async () => {
    db.user.findUnique.mockResolvedValue(null);
    expect(await getAdminPointAccount(admin, 'u-x')).toBeNull();
  });
});

describe('원장의 차례', () => {
  it('최신순으로 읽고, 시각이 같으면 뒤에 든 것부터', async () => {
    await getAdminPointAccount(admin, 'u-1');
    expect(arg().select.pointHistory.orderBy).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });

  it('읽어 온 차례를 그대로 넘긴다 — 화면에서 다시 세우지 않는다', async () => {
    const account = await getAdminPointAccount(admin, 'u-1');
    expect(account?.ledger.map((l) => l.id)).toEqual(['p-2', 'p-1']);
  });

  it('기본은 최근 30줄', async () => {
    await getAdminPointAccount(admin, 'u-1');
    expect(arg().select.pointHistory.take).toBe(30);
  });

  it('넘긴 수를 쓴다', async () => {
    await getAdminPointAccount(admin, 'u-1', 5);
    expect(arg().select.pointHistory.take).toBe(5);
  });
});

describe('원장 한 줄에 담기는 것', () => {
  it('사유와 메모와 소멸 예정일을 그대로 싣는다', async () => {
    const account = await getAdminPointAccount(admin, 'u-1');
    expect(account?.ledger[0]).toEqual(LEDGER[0]);
    expect(account?.ledger[1]?.expiresAt).toEqual(new Date('2027-10-20T03:00:00Z'));
  });

  it('메모가 없으면 null — 빈 글자로 바꾸지 않는다', async () => {
    const account = await getAdminPointAccount(admin, 'u-1');
    expect(account?.ledger[1]?.note).toBeNull();
  });
});

describe('잔액', () => {
  it('저장된 잔액을 쓴다 — 잘라 온 원장을 더하지 않는다', async () => {
    /*
     * 원장은 30줄로 끊어 온다. 더해서 내면 **오래된 회원일수록 틀린 잔액**이 뜨고,
     * 그 값을 보고 조정하면 틀린 만큼 그대로 준다. 여기 원장의 합은 500 인데 잔액은 12,300 이다.
     */
    const account = await getAdminPointAccount(admin, 'u-1');
    expect(account?.balance).toBe(12_300);
    expect(LEDGER.reduce((sum, l) => sum + l.amount, 0)).not.toBe(account?.balance);
  });
});

describe('탈퇴한 계정', () => {
  it('탈퇴 시각을 닫힌 때로 준다 — 원장은 그대로 보인다', async () => {
    /*
     * 탈퇴해도 원장은 남는다. 탈퇴 전에 나간 지급을 되짚을 자리가 있어야 하고,
     * 화면은 이 값으로 "닫힌 계정" 을 표시해 조정 단추를 감춘다.
     */
    const closedAt = new Date('2026-10-25T00:00:00Z');
    db.user.findUnique.mockResolvedValue({ ...USER, deletedAt: closedAt });

    const account = await getAdminPointAccount(admin, 'u-1');

    expect(account?.closedAt).toEqual(closedAt);
    expect(account?.ledger).toHaveLength(2);
  });

  it('살아 있는 계정은 null', async () => {
    expect((await getAdminPointAccount(admin, 'u-1'))?.closedAt).toBeNull();
  });
});
