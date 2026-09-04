import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const redirect = vi.hoisted(() => vi.fn<(...a: any[]) => never>((to: string) => {
  throw new Error(`REDIRECT:${to}`);
}));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/headers', () => ({ headers: () => Promise.resolve(new Headers()) }));

const getActor = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/auth/session', () => ({ getActor }));

const { requireAdmin } = await import('~/lib/admin/guard');

const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const merchant: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const orphanMerchant: Actor = { id: 'u-o', role: 'MERCHANT', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };

beforeEach(() => vi.clearAllMocks());

describe('어드민 가드', () => {
  it('비로그인은 로그인으로 보낸다', async () => {
    getActor.mockResolvedValue(null);
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login?next=/admin');
  });

  it('고객은 order:read 를 가졌어도 콘솔에 못 들어간다', async () => {
    /**
     * 권한 표에서 CUSTOMER 도 order:read·product:read 를 갖는다.
     * 넘겨받은 권한만 보면 이 가드를 그대로 통과했고, 페이지는 DB 를 친 뒤
     * 뒤에서 던졌다 — 오류 로그에 fatal 로 쌓이고서야 드러났다.
     */
    getActor.mockResolvedValue(customer);
    await expect(requireAdmin('order:read')).rejects.toThrow('REDIRECT:/');
    await expect(requireAdmin('product:read')).rejects.toThrow('REDIRECT:/');
  });

  it('가맹점은 자기 권한 안에서 들어간다', async () => {
    getActor.mockResolvedValue(merchant);
    await expect(requireAdmin('order:read')).resolves.toBe(merchant);
    await expect(requireAdmin('product:write')).resolves.toBe(merchant);
  });

  it('가맹점도 없는 권한은 막힌다', async () => {
    getActor.mockResolvedValue(merchant);
    // 쿠폰은 플랫폼 비용이라 가맹점이 만들지 않는다
    await expect(requireAdmin('coupon:write')).rejects.toThrow('REDIRECT:/');
  });

  it('소속 없는 가맹점 계정은 아무것도 못 본다 — 의도된 안전 기본값이다', async () => {
    getActor.mockResolvedValue(orphanMerchant);
    await expect(requireAdmin('order:read')).rejects.toThrow('REDIRECT:/');
  });

  it('운영진은 통과한다', async () => {
    getActor.mockResolvedValue(admin);
    await expect(requireAdmin()).resolves.toBe(admin);
    await expect(requireAdmin('order:refund')).resolves.toBe(admin);
  });

  it('운영진에게 없는 권한은 막는다', async () => {
    // 권한 부여·입점 승인·정산 지급은 슈퍼관리자만 — 한 사람이 완결하지 못하게 나눴다
    getActor.mockResolvedValue(admin);
    await expect(requireAdmin('user:assignRole')).rejects.toThrow('REDIRECT:/');
    await expect(requireAdmin('settlement:pay')).rejects.toThrow('REDIRECT:/');
  });
});
