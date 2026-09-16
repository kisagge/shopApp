// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import type { MerchantStatus } from '@shop/core';

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));
const getMyApplication = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/merchant/apply', () => ({ getMyApplication }));
const redirect = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
/*
 * 실제 모듈 위에 덮는다. 화면이 쓰지 않는 것까지 손으로 적으면(unstable_rethrow 처럼)
 * Next 가 하나 더할 때마다 여기가 깨진다.
 */
vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));
vi.mock('@shop/db', () => ({ prisma: {} }));

const Page = (await import('~/app/(shop)/merchant/apply/page')).default;

/**
 * 입점 신청 화면 — 지난 신청의 결과를 어떻게 말하는가.
 *
 * **반려와 해지를 한 값에 담아 두고 있었다.** 반려라는 상태가 없어서 해지를 대신
 * 썼고, 그래서 이 안내(merch.rejected)가 해지에 붙어 있었다. 둘이 갈린 지금은
 * 각자의 말을 하고, 반려에는 **무엇을 고쳐야 하는지**까지 적는다.
 */

const REASON = '제출하신 브랜드 서류가 사업자등록증 상호와 다릅니다';

const application = (status: MerchantStatus, rejectionReason: string | null = null) => ({
  id: 'm-1', name: '무어', brandName: 'MOOR', status,
  createdAt: new Date('2026-09-01T00:00:00Z'), approvedAt: null, rejectionReason,
});

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue({ id: 'u-1', email: 'me@plain.test', merchantId: null });
  getMyApplication.mockResolvedValue(null);
});

const renderPage = async () => render(await Page());

describe('반려된 신청', () => {
  it('반려됐다고 말하고 사유를 함께 보여 준다', async () => {
    getMyApplication.mockResolvedValue(application('REJECTED', REASON));

    await renderPage();

    expect(screen.getByText(/반려되었습니다/)).toBeInTheDocument();
    expect(screen.getByText(REASON)).toBeInTheDocument();
  });

  it('다시 낼 수 있게 양식을 함께 둔다 — 반려가 영구 거절이 되면 안 된다', async () => {
    getMyApplication.mockResolvedValue(application('REJECTED', REASON));

    await renderPage();

    expect(screen.getByRole('button', { name: /신청/ })).toBeInTheDocument();
  });

  it('사유가 비어 있어도 화면이 깨지지 않는다', async () => {
    // 이 컬럼이 생기기 전에 반려된 줄은 사유가 없다
    getMyApplication.mockResolvedValue(application('REJECTED', null));

    await renderPage();

    expect(screen.getByText(/반려되었습니다/)).toBeInTheDocument();
  });
});

describe('해지된 입점', () => {
  it('반려가 아니라 해지라고 말한다', async () => {
    /*
     * 둘은 다른 일이다 — 해지는 장사를 하다 그만둔 것이고, 반려는 애초에
     * 들어온 적이 없는 것이다. 같은 말을 쓰면 읽는 사람이 자기 일을 오해한다.
     */
    getMyApplication.mockResolvedValue(application('TERMINATED'));

    await renderPage();

    expect(screen.getByText(/해지되었습니다/)).toBeInTheDocument();
    expect(screen.queryByText(/반려되었습니다/)).toBeNull();
  });
});

describe('살아 있는 신청', () => {
  it('심사 중이면 양식 대신 상태를 보여 준다', async () => {
    getMyApplication.mockResolvedValue(application('PENDING'));

    await renderPage();

    expect(screen.getByText(/승인 대기/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /신청/ })).toBeNull();
  });

  it('지난 반려 사유가 심사 중인 신청에 섞이지 않는다', async () => {
    // 새로 내면 새 줄이라 사유가 없다. 남아 있으면 지금 상태를 잘못 읽는다.
    getMyApplication.mockResolvedValue(application('PENDING'));

    await renderPage();

    expect(screen.queryByText(REASON)).toBeNull();
  });
});
