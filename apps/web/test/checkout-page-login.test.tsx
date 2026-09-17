import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 결제 화면에 로그인 없이 오면 로그인으로 보내고, **돌아올 곳에 바로 구매를 남긴다.**
 * 빠뜨리면 로그인하고 돌아와 장바구니를 산다 — 사려던 것이 아니다.
 */

const redirect = vi.hoisted(() => vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); }));
vi.mock('next/navigation', () => ({ redirect }));
const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));
vi.mock('~/lib/queries/orders', () => ({ getDefaultAddress: vi.fn() }));
vi.mock('~/lib/shipping-policy', () => ({ getShippingPolicy: vi.fn() }));
vi.mock('~/lib/i18n/server', () => ({ getT: async () => (key: string) => key }));
vi.mock('~/lib/payments', () => ({ serverPaymentMode: () => ({ mode: 'mock' }) }));
vi.mock('~/components/checkout-form', () => ({ CheckoutForm: () => null }));
vi.mock('~/components/checkout/unavailable', () => ({ CheckoutUnavailable: () => null }));

const Page = (await import('~/app/(shop)/checkout/page')).default;

const open = (params: Record<string, string>) => Page({ searchParams: Promise.resolve(params) });

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue(null);
});

describe('로그인하지 않았을 때', () => {
  it('바로 구매로 왔으면 돌아올 곳에 그것을 남긴다', async () => {
    await expect(open({ now: '1' })).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith('/login?next=/checkout?now=1');
    // 로그인 화면이 읽는 값 — 쿼리 값 안의 `?` 는 그대로 이어진다
    expect(new URL('http://x/login?next=/checkout?now=1').searchParams.get('next')).toBe('/checkout?now=1');
  });

  it('장바구니에서 왔으면 결제 화면으로 돌아온다', async () => {
    await expect(open({})).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith('/login?next=/checkout');
  });

  it('모르는 값은 바로 구매로 읽지 않는다', async () => {
    await expect(open({ now: 'yes' })).rejects.toThrow();
    expect(redirect).toHaveBeenCalledWith('/login?next=/checkout');
  });
});
