// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 주문 상세 — **손님이 주문 하나를 두고 할 수 있는 일이 전부 모인 화면.**
 *
 * 416줄인데 검사가 한 줄도 없었다. 무엇을 세우고 무엇을 감출지는 core 가 정하지만(orderView),
 * **그 판정을 화면이 그대로 따르는지**는 아무도 안 봤다 — 단추 하나를 엉뚱한 조건에 걸어도
 * 타입 검사는 통과하고, e2e 는 그 조합을 다 밟지 못한다.
 *
 * 화면만 아는 일도 있다. 로그인하지 않았으면 **돌아올 곳을 들고** 로그인으로 보내는 것(없으면
 * 로그인한 뒤 첫 화면에 떨어진다), 결제가 안 끝났는데 체크 표시를 띄우지 않는 것, 그리고
 * **필요할 때만 무거운 조회를 하는 것** — 그 셋은 core 가 모른다.
 */

const redirect = vi.hoisted(() => vi.fn((url: string) => { throw new Error(`REDIRECT ${url}`); }));
const notFound = vi.hoisted(() => vi.fn(() => { throw new Error('NOT_FOUND'); }));
vi.mock('next/navigation', () => ({ redirect, notFound }));

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));

const getOrderForUser = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getExchangeOptions = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const getDisplayedProductSlugs = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/orders', () => ({ getOrderForUser, getExchangeOptions, getDisplayedProductSlugs }));

const approvedReturnDestinations = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/orders/return-address', () => ({ approvedReturnDestinations }));

vi.mock('~/lib/shipping-policy', () => ({
  getShippingPolicy: async () => ({ baseFee: 3_000, freeThreshold: 50_000, remoteSurcharge: 3_000 }),
}));
vi.mock('~/lib/payments', () => ({ serverPaymentMode: () => ({ mode: 'mock' }) }));
vi.mock('~/lib/i18n/server', async () => {
  const { createTranslator } = await import('@shop/i18n/all');
  const t = createTranslator('ko');
  return { getT: async () => t, getLocale: async () => 'ko' };
});

/** 누르는 자리는 자기 검사가 있다 — 여기서는 **섰는지 안 섰는지**만 본다 */
const stub = (label: string) => ({ [label]: () => <div data-stub={label} /> });
vi.mock('~/components/cancel-order-button', () => stub('CancelOrderButton'));
vi.mock('~/components/cancel-items-form', () => stub('CancelItemsForm'));
vi.mock('~/components/repay-button', () => stub('RepayButton'));
vi.mock('~/components/reorder-button', () => stub('ReorderButton'));
vi.mock('~/components/confirm-purchase-button', () => stub('ConfirmPurchaseButton'));
vi.mock('~/components/return-request-form', () => stub('ReturnRequestForm'));
vi.mock('~/components/order-address-edit', () => stub('OrderAddressEdit'));
vi.mock('~/components/tracking-panel', () => stub('TrackingPanel'));
vi.mock('~/components/late-deposit-notice', () => stub('LateDepositNotice'));
vi.mock('./order-lines', () => ({ OrderLines: () => <div data-stub="OrderLines" /> }));
vi.mock('~/app/(shop)/order/[orderNo]/order-lines', () => ({ OrderLines: () => <div data-stub="OrderLines" /> }));
vi.mock('~/app/(shop)/order/[orderNo]/return-panel', () => ({ ReturnPanel: () => <div data-stub="ReturnPanel" /> }));

const Page = (await import('~/app/(shop)/order/[orderNo]/page')).default;

const item = (over: Record<string, unknown> = {}) => ({
  id: 'i-1', canceledAt: null, status: 'DELIVERED',
  productName: '울 코트', brandName: 'MOOR', optionLabel: '오트 / M',
  imageUrl: null, quantity: 1, subtotal: 289_000,
  variant: { productId: 'p-1' }, review: null,
  ...over,
});

const order = (over: Record<string, unknown> = {}) => ({
  orderNo: '20260930-0000001',
  status: 'DELIVERED',
  payable: 292_000,
  rewardPoints: 2_890,
  couponDiscount: 0,
  pointsUsed: 0,
  shippingFee: 3_000,
  listTotal: 289_000,
  productDiscount: 0,
  placedAt: new Date('2026-09-30T01:00:00Z'),
  deliveredAt: new Date('2026-10-02T01:00:00Z'),
  recipient: '장○○', phone: '010-1234-5678',
  postalCode: '04524', address1: '서울 중구 세종대로 110', address2: '3층',
  deliveryMemo: null,
  addressChangedAt: null,
  carrier: null, trackingNumber: null, shippedAt: null,
  payment: { method: 'CARD', status: 'DONE', virtualAccount: null, virtualBank: null, virtualDueDate: null, lateDepositAt: null, lateDepositAmount: null, lateDepositResolvedAt: null },
  items: [item()],
  refunds: [],
  returnRequests: [],
  ...over,
});

const open = async (params: Record<string, string> = {}) =>
  render(await Page({
    params: Promise.resolve({ orderNo: '20260930-0000001' }),
    searchParams: Promise.resolve(params),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue({ id: 'u-1' });
  getOrderForUser.mockResolvedValue(order());
  getExchangeOptions.mockResolvedValue({});
  getDisplayedProductSlugs.mockResolvedValue(new Map());
  approvedReturnDestinations.mockResolvedValue([]);
});

describe('들어올 수 있는 사람', () => {
  /** 없으면 로그인한 뒤 첫 화면에 떨어진다 — 보려던 주문은 다시 찾아 들어가야 한다 */
  it('로그인하지 않았으면 돌아올 곳을 들고 로그인으로 보낸다', async () => {
    getViewer.mockResolvedValue(null);

    await expect(open()).rejects.toThrow(/REDIRECT/);
    expect(redirect).toHaveBeenCalledWith('/login?next=%2Forder%2F20260930-0000001');
  });

  /** 남의 주문인지 없는 주문인지 구분해 주면 주문번호를 넣어 보며 알아낼 수 있다 */
  it('내 주문이 아니면 없는 주문과 같이 404 다', async () => {
    getOrderForUser.mockResolvedValue(null);

    await expect(open()).rejects.toThrow('NOT_FOUND');
  });

  it('조회에 내 id 를 함께 넘긴다 — 주문번호만으로 열면 남의 주문이 열린다', async () => {
    await open();

    expect(getOrderForUser).toHaveBeenCalledWith('20260930-0000001', 'u-1');
  });
});

/**
 * **결제가 안 끝났는데 체크 표시를 띄우면 끝난 줄 안다.**
 *
 * 예전에는 갓 접수된 주문과 결제가 깨진 주문을 구분하지 않고 똑같이 "주문이 접수되었습니다" 를
 * 띄웠다. 사람은 결제가 된 줄 알았고, 실제로는 재고만 물고 있는 주문이 남았다.
 */
describe('결제가 안 끝난 주문', () => {
  const unpaid = (over: Record<string, unknown> = {}) =>
    order({
      status: 'PENDING',
      payment: { method: 'CARD', status: 'READY', virtualAccount: null, virtualBank: null, virtualDueDate: null, lateDepositAt: null, lateDepositAmount: null, lateDepositResolvedAt: null },
      deliveredAt: null,
      ...over,
    });

  it('체크 대신 느낌표를 띄운다', async () => {
    getOrderForUser.mockResolvedValue(unpaid());

    await open();

    expect(screen.getByText('!')).toBeDefined();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('다시 결제할 자리를 둔다', async () => {
    getOrderForUser.mockResolvedValue(unpaid());

    await open();

    expect(document.querySelector('[data-stub="RepayButton"]')).not.toBeNull();
  });

  /**
   * **결제 화면에서 막 실패해 넘어온 사람에게만 알린다.** 나중에 주문 내역에서 다시 들어온
   * 사람에게는 새로 난 일이 아니라, 낭독기가 가로채 읽을 일도 아니다.
   */
  it('막 실패해 넘어왔으면 알림으로, 아니면 상태로 말한다', async () => {
    getOrderForUser.mockResolvedValue(unpaid());

    await open({ payment: 'failed' });
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);

    document.body.innerHTML = '';
    await open();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('결제가 끝난 주문에는 체크를 띄운다', async () => {
    await open();

    expect(screen.getByText('✓')).toBeDefined();
  });
});

/**
 * **무엇을 세우고 무엇을 감출지는 core 가 정한다**(orderView). 화면은 그 판정을 옮기기만 한다 —
 * 조건을 화면에 다시 적는 순간 둘이 갈리고, 그때 손님은 **누를 수 없는 단추**를 누른다.
 */
describe('core 의 판정을 그대로 따른다', () => {
  it.each([
    ['CancelOrderButton', order({ status: 'PAID', deliveredAt: null })],
    ['ConfirmPurchaseButton', order({ status: 'DELIVERED' })],
    ['ReturnRequestForm', order({ status: 'DELIVERED' })],
  ])('%s 는 그 상태에서 선다', async (stubName, row) => {
    getOrderForUser.mockResolvedValue(row);

    await open();

    expect(document.querySelector(`[data-stub="${stubName}"]`)).not.toBeNull();
  });

  it.each([
    ['CancelOrderButton', 'DELIVERED'],
    ['ConfirmPurchaseButton', 'PAID'],
    ['ReturnRequestForm', 'PREPARING'],
  ])('%s 는 아닌 상태에서는 서지 않는다', async (stubName, status) => {
    getOrderForUser.mockResolvedValue(order({ status, deliveredAt: status === 'DELIVERED' ? new Date() : null }));

    await open();

    expect(document.querySelector(`[data-stub="${stubName}"]`)).toBeNull();
  });

  /** 끝난 주문에도 늘 서는 자리 — 다시 담기는 언제나 할 수 있다 */
  it('다시 담기는 늘 선다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'REFUNDED' }));

    await open();

    expect(document.querySelector('[data-stub="ReorderButton"]')).not.toBeNull();
  });
});

/**
 * **무거운 조회는 필요할 때만 한다.**
 *
 * 보낼 곳은 승인된 신청이 있을 때만, 교환 옵션은 폼을 띄울 때만 읽는다. 조건을 떼면 화면은
 * 똑같이 그려지고 **왕복만 는다** — 눈으로는 영영 안 보이는 종류의 고장이다.
 */
describe('필요할 때만 묻는다', () => {
  it('걸린 신청이 없으면 보낼 곳을 읽지 않는다', async () => {
    await open();

    expect(approvedReturnDestinations).not.toHaveBeenCalled();
  });

  it('신청이 있으면 읽는다', async () => {
    getOrderForUser.mockResolvedValue(order({
      status: 'RETURN_REQUESTED',
      returnRequests: [{ id: 'r-1', type: 'RETURN', reason: 'DEFECT', status: 'APPROVED', detail: null, rejectReason: null, shippingBorneBy: 'SELLER', reshipCarrier: null, reshipTrackingNumber: null, exchangeLines: [], approvedAt: new Date('2026-10-03T00:00:00Z'), receivedAt: null }],
    }));

    await open();

    expect(approvedReturnDestinations).toHaveBeenCalled();
  });

  it('반품 폼을 안 띄우면 교환 옵션을 읽지 않는다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'PREPARING', deliveredAt: null }));

    await open();

    expect(getExchangeOptions).not.toHaveBeenCalled();
  });

  it('반품 폼을 띄우면 읽는다', async () => {
    await open();

    expect(getExchangeOptions).toHaveBeenCalled();
  });

  /** 줄마다 상품 화면으로 가는 길 — 매대에 있는 것만 링크가 된다 */
  it('상품 주소는 줄의 상품 id 로 한 번에 묻는다', async () => {
    getOrderForUser.mockResolvedValue(order({
      items: [item(), item({ id: 'i-2', variant: { productId: 'p-2' } })],
    }));

    await open();

    expect(getDisplayedProductSlugs).toHaveBeenCalledWith(['p-1', 'p-2']);
  });
});

describe('화면에 적는 것', () => {
  it('주문번호와 지금 상태를 적는다', async () => {
    await open();

    expect(screen.getByText('20260930-0000001')).toBeDefined();
    expect(document.body.textContent).toContain('배송완료');
  });

  /** 다음에 무엇이 일어나는지 — 갈래로 빠진 상태에는 할 말이 없다 */
  it('다음 걸음을 말한다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'PAID', deliveredAt: null }));

    await open();

    expect(document.body.textContent).toContain('배송 준비');
  });

  it('갈래로 빠진 상태에는 다음 걸음을 적지 않는다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'REFUNDED' }));

    await open();

    expect(document.body.textContent).not.toContain('배송 준비를 시작합니다');
  });

  /** 구매확정 직후에만 — 말없이 들어오면 잔액이 왜 늘었는지 모른다 */
  it('구매확정하고 막 돌아왔으면 적립을 알린다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'CONFIRMED' }));

    await open({ confirmed: '1' });

    expect(screen.getByRole('status').textContent).toContain('2,890');
  });

  it('적립이 0이면 숫자 없이 말한다', async () => {
    getOrderForUser.mockResolvedValue(order({ status: 'CONFIRMED', rewardPoints: 0 }));

    await open({ confirmed: '1' });

    expect(screen.getByRole('status').textContent).not.toContain('0P');
  });

  it('주문 줄과 반품 안내는 자기 자리에 둔다', async () => {
    await open();

    expect(document.querySelector('[data-stub="OrderLines"]')).not.toBeNull();
    expect(document.querySelector('[data-stub="ReturnPanel"]')).not.toBeNull();
  });
});
