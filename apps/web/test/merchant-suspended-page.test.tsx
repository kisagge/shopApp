// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';

/**
 * 가맹점 운영이 멈췄다고 말하는 화면 — 말없이 첫 화면으로 튕기던 자리.
 */

const redirect = vi.hoisted(() => vi.fn<(...a: any[]) => never>((to: string) => { throw new Error(`REDIRECT:${to}`); }));
vi.mock('next/navigation', () => ({ redirect }));
const getNavUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getNavUser }));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));
const findMerchant = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/db', () => ({ prisma: { merchant: { findUnique: findMerchant } } }));

const Page = (await import('~/app/(shop)/merchant/suspended/page')).default;

/**
 * **떨어뜨린 사람의 merchantId 는 null 이다** — 그 범위를 더 갖지 않는다. 어느 가게였는지는 blockedMerchantId 에
 * 있다. 한동안 여기 fixture 가 둘 다 채워 두어(있을 수 없는 조합) 화면이 늘 첫 화면으로 튕기는 것을 놓쳤다.
 */
const blocked = {
  id: 'u-m', name: '무어', email: 'm@b.test', role: 'CUSTOMER', merchantId: null,
  merchantBlocked: true, blockedMerchantId: 'm-a',
};

beforeEach(() => {
  vi.clearAllMocks();
  getNavUser.mockResolvedValue(blocked);
  findMerchant.mockResolvedValue({ name: '무어', status: 'SUSPENDED', suspendedReason: null });
});

describe('가맹점 정지 안내', () => {
  it('비로그인은 로그인으로, 돌아올 곳을 들고 간다', async () => {
    getNavUser.mockResolvedValue(null);
    await expect(Page()).rejects.toThrow('REDIRECT:/login?next=/merchant/suspended');
  });

  it('멀쩡한 가맹점·손님이 주소를 치고 들어오면 보여 줄 것이 없다', async () => {
    getNavUser.mockResolvedValue({
      ...blocked, role: 'MERCHANT', merchantId: 'm-a', merchantBlocked: false, blockedMerchantId: null,
    });
    await expect(Page()).rejects.toThrow('REDIRECT:/');
  });

  it('멈춘 가게를 blockedMerchantId 로 찾는다 — 권한이 쓰는 merchantId 는 비어 있다', async () => {
    render(await Page());
    expect(findMerchant).toHaveBeenCalledWith({
      where: { id: 'm-a' }, select: { name: true, status: true, suspendedReason: true },
    });
  });

  it('가맹점 이름과 지금 상태, 무엇이 그대로인지, 어디에 물을지를 적는다', async () => {
    render(await Page());

    expect(screen.getByRole('heading', { level: 1, name: '가맹점 운영이 멈춰 있습니다' })).toBeInTheDocument();
    const section = screen.getByRole('region', { name: /무어 — 일시 정지/ });
    expect(section).toHaveTextContent('운영 콘솔을 쓸 수 없습니다');
    // 돈과 물건이 사라진 것이 아니라는 말이 먼저다
    expect(section).toHaveTextContent('주문·상품·정산은 그대로 있고');
    expect(screen.getByRole('link', { name: '고객센터에 문의하기' })).toHaveAttribute('href', '/support/ask');
    expect(screen.getByRole('link', { name: '매장 둘러보기' })).toHaveAttribute('href', '/');
  });

  it('까닭이 적혀 있으면 그대로 옮긴다 — 줄바꿈까지', async () => {
    findMerchant.mockResolvedValue({
      name: '무어', status: 'SUSPENDED', suspendedReason: '정산 계좌 명의가 다릅니다.\n서류를 보내 주세요.',
    });
    render(await Page());

    expect(screen.getByText('까닭')).toBeInTheDocument();
    const reason = screen.getByText(/정산 계좌 명의가 다릅니다/);
    expect(reason).toHaveTextContent('서류를 보내 주세요');
    expect(reason).toHaveClass('whitespace-pre-wrap');
  });

  it('까닭이 없으면 그 칸을 내밀지 않는다 — 빈 상자는 "지워졌다" 로 읽힌다', async () => {
    render(await Page());
    expect(screen.queryByText('까닭')).toBeNull();
  });

  it('해지된 가맹점에는 해지라고 적는다 — 정지와 다른 일이다', async () => {
    findMerchant.mockResolvedValue({ name: '무어', status: 'TERMINATED', suspendedReason: null });
    render(await Page());
    expect(screen.getByRole('region', { name: /무어 — 해지/ })).toBeInTheDocument();
  });

  it('가맹점 행이 사라졌어도 화면은 선다', async () => {
    findMerchant.mockResolvedValue(null);
    render(await Page());
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
