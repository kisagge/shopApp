import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NOTICE_REASON_MAX } from '@shop/core';

const db = vi.hoisted(() => ({
  merchant: { findUnique: vi.fn<(...a: any[]) => any>() },
  notification: { createMany: vi.fn<(...a: any[]) => any>(() => Promise.resolve({ count: 0 })) },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { notifyMerchantDecision } = await import('~/lib/notifications/merchant-decision');

/**
 * 입점 심사 결과 알림 — 누구에게, 무엇을 실어.
 *
 * **사유는 진작 받고 있었는데 감사 로그에만 남았다.** 승인도 마찬가지다 — 계정과
 * 브랜드까지 만들어 놓고 아무 말도 안 해서, 신청자는 로그인해 보고서야 알았다.
 */

const rows = () => db.notification.createMany.mock.calls[0]?.[0]?.data as
  | { userId: string; kind: string; params: Record<string, string>; linkPath: string | null }[]
  | undefined;

const decide = (over: Record<string, unknown> = {}) =>
  notifyMerchantDecision({
    merchantId: 'm-1', merchantName: '스튜디오 눈', status: 'APPROVED', reason: '', ...over,
  });

beforeEach(() => {
  vi.clearAllMocks();
  db.merchant.findUnique.mockResolvedValue({ applicantId: 'u-applicant' });
});

describe('누구에게 가는가', () => {
  it('신청한 사람에게 간다', async () => {
    await decide();
    expect(rows()?.map((r) => r.userId)).toEqual(['u-applicant']);
  });

  it('신청자가 없는 가맹점은 알리지 않는다', async () => {
    /*
     * 운영진이 직접 만든 가맹점에는 신청자가 없다. 알릴 사람이 없는 것이지
     * 빠뜨린 것이 아니다 — 승인 시 계정을 만드는 코드도 같은 곳에서 갈린다.
     */
    db.merchant.findUnique.mockResolvedValue({ applicantId: null });

    await decide();

    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it('매장 알림함으로 간다 — 반려된 사람에게는 운영 화면이 없다', async () => {
    await decide({ status: 'REJECTED', reason: '서류 미비' });
    // 매장 쪽 경로다. 운영 화면(/admin/…)으로 보내면 반려된 사람은 열 수 없다.
    expect(rows()?.[0]?.linkPath?.startsWith('/admin')).toBe(false);
  });
});

describe('무엇이 실리는가', () => {
  it('승인에는 사유를 싣지 않는다', async () => {
    await decide();

    expect(rows()?.[0]?.kind).toBe('MERCHANT_APPROVED');
    expect(rows()?.[0]?.params).toEqual({ merchantName: '스튜디오 눈' });
  });

  it('반려에는 사유가 실린다', async () => {
    await decide({ status: 'REJECTED', reason: '브랜드 서류가 없습니다' });

    expect(rows()?.[0]).toMatchObject({
      kind: 'MERCHANT_REJECTED',
      params: { merchantName: '스튜디오 눈', reason: '브랜드 서류가 없습니다' },
    });
  });

  it('긴 사유는 줄여서 싣는다', async () => {
    // 계약은 300자까지 받는다. 알림 한 줄이 한 건으로 차면 안 된다.
    await decide({ status: 'REJECTED', reason: '가'.repeat(300) });

    const reason = rows()?.[0]?.params['reason'] ?? '';
    expect(reason.length).toBe(NOTICE_REASON_MAX);
    expect(reason.endsWith('…')).toBe(true);
  });
});

describe('알릴 것이 있는 처분만', () => {
  it.each(['PENDING', 'SUSPENDED', 'TERMINATED'] as const)(
    '%s 는 아직 이 길을 타지 않는다',
    async (status) => {
      await decide({ status, reason: '사유' });
      expect(db.merchant.findUnique).not.toHaveBeenCalled();
      expect(db.notification.createMany).not.toHaveBeenCalled();
    },
  );
});

describe('실패해도 처분을 무르지 않는다', () => {
  it('조회가 터져도 던지지 않는다', async () => {
    db.merchant.findUnique.mockRejectedValue(new Error('DB 가 죽었다'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await expect(decide()).resolves.toBeUndefined();

    // 조용히 삼키지는 않는다 — 로그에는 남는다
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
