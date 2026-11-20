import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { applyMerchantSchema } from '@shop/contract';

/**
 * **알림을 부르는 한 줄.**
 *
 * 이 저장소는 이 고장을 이미 겪었다 — "운영 알림함에 처리할 일이 오지 않았다.
 * 반품 신청·문의·입점 신청이 들어와도 목록을 열어 보기 전까지 아무도 몰랐다."
 * 고치고 나서 **그 배선을 재는 자리를 두지 않았다.**
 *
 * `console-work` 의 손잡이 열 개는 **저마다 부르는 자리가 딱 한 곳**이다. 그
 * 한 줄을 지워도 함수 자신의 검사(`console-work-notices`)는 그대로 초록이고,
 * 창구의 검사도 초록이다 — 알림만 조용히 사라진다. 그래서 여기서는 함수가
 * 무엇을 하는지가 아니라 **누가 그것을 부르는지**를 본다.
 */

const ROOT = join(import.meta.dirname, '..');
const CONSOLE_WORK = 'src/lib/notifications/console-work.ts';

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });

describe('부르는 자리가 있다', () => {
  /*
   * **손 목록을 두지 않는다** — 손잡이가 늘면 저절로 끌려 들어온다. 새 알림을
   * 만들어 놓고 아무 데서도 부르지 않는 것도 여기서 걸린다.
   */
  const handles = [
    ...readFileSync(join(ROOT, CONSOLE_WORK), 'utf8').matchAll(/export async function (\w+)/g),
  ].map((m) => m[1]!);

  const sources = walk(join(ROOT, 'src'))
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('lib/notifications'))
    .map((f) => [f.slice(ROOT.length + 1), readFileSync(f, 'utf8')] as const);

  it('손잡이를 찾았다 — 못 찾으면 이 검사가 헛돈다', () => {
    expect(handles.length).toBeGreaterThanOrEqual(10);
  });

  it.each(handles.map((h) => [h]))('%s 를 부르는 자리가 있다', (handle) => {
    /*
     * 지워지면 여기서 진다. 알림이 사라진 것을 사람이 알아차리는 경로는 "며칠
     * 뒤에 대기열이 쌓인 것을 보고" 뿐인데, 그때는 이미 늦은 일들이다.
     */
    const callers = sources.filter(([, code]) => code.includes(`${handle}(`));

    expect(callers.map(([file]) => file), `${handle} 를 아무도 부르지 않는다`).not.toEqual([]);
  });
});

/* ── 창구 셋: 실제로 그 줄을 밟아 본다 ───────────────────────── */

const notify = vi.hoisted(() => ({
  notifyInquiryReceived: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
  notifyMerchantApplied: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
  notifyReturnRequested: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
  notifyReturnAddressMissing: vi.fn<(...a: any[]) => any>(() => Promise.resolve()),
}));
vi.mock('~/lib/notifications/console-work', () => notify);

const session = vi.hoisted(() => ({
  getSessionUser: vi.fn<(...a: any[]) => any>(),
  getActor: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/auth/session', () => session);
vi.mock('~/lib/rate-limit', () => ({ enforceRateLimit: vi.fn(() => Promise.resolve(null)) }));
/* 캐시는 공용 흉내를 쓴다 — 손으로 적으면 창구가 하나 늘 때 이 파일만 조용히 깨진다 */
const cache = await vi.hoisted(async () => (await import('./support/cache-mock')).cacheMock());
vi.mock('~/lib/cache', () => cache);

const createInquiry = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/inquiry/write', async (orig) => ({
  ...(await orig<typeof import('~/lib/inquiry/write')>()),
  createInquiry,
}));
vi.mock('~/lib/inquiry/images', () => ({
  uploadInquiryImages: vi.fn(() => Promise.resolve([])),
  discardInquiryImages: vi.fn(() => Promise.resolve()),
}));

const applyForMerchant = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/merchant/apply', async (orig) => ({
  ...(await orig<typeof import('~/lib/merchant/apply')>()),
  applyForMerchant,
}));

const requestReturn = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/return-request', async (orig) => ({
  ...(await orig<typeof import('~/lib/orders/return-request')>()),
  requestReturn,
}));
const ownersMissingReturnAddress = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/return-address', async (orig) => ({
  ...(await orig<typeof import('~/lib/orders/return-address')>()),
  ownersMissingReturnAddress,
}));

vi.mock('@shop/db', () => ({ prisma: {}, Prisma: {} }));

const inquiries = (await import('~/app/api/inquiries/route')).POST;
const merchantApply = (await import('~/app/api/merchant/apply/route')).POST;
const customerReturn = (await import('~/app/api/orders/[orderNo]/return/route')).POST;

const post = (body: unknown) =>
  new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  const user = { id: 'u-1', role: 'CUSTOMER', merchantId: null };
  session.getSessionUser.mockResolvedValue(user);
  session.getActor.mockResolvedValue(user);
  createInquiry.mockResolvedValue({ id: 'q-1' });
  applyForMerchant.mockResolvedValue({ id: 'm-1', name: '무어', status: 'PENDING' });
  requestReturn.mockResolvedValue({ orderNo: '20261120-0000001', itemIds: ['oi-1'] });
  ownersMissingReturnAddress.mockResolvedValue([]);
});

describe('문의 창구', () => {
  it('문의를 만든 뒤 그 문의로 알린다', async () => {
    const response = await inquiries(post({ topic: 'DELIVERY', content: '언제쯤 받을 수 있을까요?' }));

    expect(response.status).toBe(201);
    expect(notify.notifyInquiryReceived).toHaveBeenCalledExactlyOnceWith('q-1');
  });

  it('문의를 못 만들면 알리지 않는다 — 없는 일을 알리면 대기열에 유령이 선다', async () => {
    /* 도메인 오류가 아닌 것은 `apiError` 가 그대로 올린다 — 여기서 볼 것은 알림이다 */
    createInquiry.mockRejectedValue(new Error('terminated'));

    await expect(
      inquiries(post({ topic: 'DELIVERY', content: '언제쯤 받을 수 있을까요?' })),
    ).rejects.toThrow();

    expect(notify.notifyInquiryReceived).not.toHaveBeenCalled();
  });
});

describe('입점 신청 창구', () => {
  const body = {
    name: '무어', brandName: 'MOOR', businessName: '무어상사',
    businessNumber: '1234567890', representative: '홍길동',
    contactEmail: 'a@b.test', contactPhone: '010-1111-2222',
  };

  it('신청을 만든 뒤 심사하는 사람에게 알린다', async () => {
    const response = await merchantApply(post(applyMerchantSchema.parse(body)));

    expect(response.status).toBe(201);
    expect(notify.notifyMerchantApplied).toHaveBeenCalledOnce();
  });

  it('신청이 막히면 알리지 않는다', async () => {
    /* 도메인 오류가 아닌 것은 `apiError` 가 그대로 올린다 — 여기서 볼 것은 알림이다 */
    applyForMerchant.mockRejectedValue(new Error('이미 가맹점입니다'));

    await expect(merchantApply(post(applyMerchantSchema.parse(body)))).rejects.toThrow();

    expect(notify.notifyMerchantApplied).not.toHaveBeenCalled();
  });
});

describe('반품 신청 창구', () => {
  const params = Promise.resolve({ orderNo: '20261120-0000001' });
  const body = { type: 'RETURN', reason: 'CHANGED_MIND', detail: '색이 생각과 달랐습니다' };

  it('신청한 뒤 처리할 사람에게 알린다 — 그 주문과 줄까지 함께', async () => {
    await customerReturn(post(body), { params });

    expect(notify.notifyReturnRequested).toHaveBeenCalledExactlyOnceWith({
      orderNo: '20261120-0000001',
      itemIds: ['oi-1'],
    });
  });

  it('보낼 곳이 없는 판매처가 있으면 그 사실도 알린다', async () => {
    /*
     * **보낼 곳이 없으면 승인할 수 없다.** 누를 생각을 안 하면 영영 드러나지 않고,
     * 그사이 신청은 대기열에 갇혀 손님 화면에는 "승인을 기다리는 중" 만 뜬다.
     */
    ownersMissingReturnAddress.mockResolvedValue(['m-a']);

    await customerReturn(post(body), { params });

    expect(notify.notifyReturnAddressMissing).toHaveBeenCalledExactlyOnceWith({
      orderNo: '20261120-0000001',
      owners: ['m-a'],
    });
  });

  it('빠진 곳이 없어도 부른다 — 끝난 일을 닫는 쪽이 그 안에 있다', async () => {
    await customerReturn(post(body), { params });

    expect(notify.notifyReturnAddressMissing).toHaveBeenCalledExactlyOnceWith({
      orderNo: '20261120-0000001',
      owners: [],
    });
  });

  it('신청이 거절되면 둘 다 알리지 않는다', async () => {
    requestReturn.mockRejectedValue(new Error('기한이 지났습니다'));

    await expect(customerReturn(post(body), { params })).rejects.toThrow();

    expect(notify.notifyReturnRequested).not.toHaveBeenCalled();
    expect(notify.notifyReturnAddressMissing).not.toHaveBeenCalled();
  });
});
