// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import type { ReturnDestination } from '@shop/core';

/**
 * 반품·교환 안내 — **손님이 물건을 돌려보내려고 읽는 화면.**
 *
 * 238줄인데 검사가 한 줄도 없었다. 여기서 틀리면 **물건이 엉뚱한 곳으로 간다**: "상품을 보내 주세요"
 * 만 있고 주소가 없으면 받은 상자의 출고지로 보내거나 고객센터에 묻고, 출고지가 물류 대행사면 아무도
 * 그 상자를 확인하지 못한다. 돈과 물건이 동시에 묶이는 자리다.
 *
 * 주석이 세 가지 고장을 기억하고 있다 — 까닭을 반려에만 보여 줘서 철회된 신청이 "사라진 것" 으로
 * 읽힌 일, 교환 송장에 조회 링크가 없어 번호를 옮겨 적게 한 일, 무를 길이 없어 주문이 반품접수에
 * 갇힌 일. 그 셋을 여기서 못 박는다.
 */

vi.mock('~/lib/i18n/server', async () => {
  const { createTranslator } = await import('@shop/i18n/all');
  const t = createTranslator('ko');
  return { getT: async () => t };
});
vi.mock('~/components/cancel-return-button', () => ({
  CancelReturnButton: (props: Record<string, string>) => (
    <button type="button" data-cancel={props.type}>신청 무르기</button>
  ),
}));

const { ReturnPanel } = await import('~/app/(shop)/order/[orderNo]/return-panel');

const items = [
  { id: 'i-1', productName: '울 코트', optionLabel: '오트 / M' },
  { id: 'i-2', productName: '램스울 니트', optionLabel: '블랙 / L' },
];

const active = (over: Record<string, unknown> = {}) => ({
  type: 'RETURN', reason: 'DEFECT', status: 'REQUESTED',
  detail: null, rejectReason: null, shippingBorneBy: 'SELLER',
  reshipCarrier: null, reshipTrackingNumber: null, exchangeLines: [],
  ...over,
});

const address = (over: Record<string, unknown> = {}) => ({
  recipient: '무어 물류', phone: '02-1234-5678',
  postalCode: '04524', address1: '서울 중구 세종대로 110', address2: '3층',
  ...over,
});

const destination = (over: Partial<ReturnDestination> = {}): ReturnDestination =>
  ({ merchantId: 'm-1', address: address(), itemIds: ['i-1'], changedSinceApproval: false, ...over });

const open = async (props: Record<string, unknown> = {}) =>
  render(await ReturnPanel({
    orderNo: '20260930-0000001', items, activeReturn: null, returnTo: [], canCancelReturn: false,
    ...props,
  }));

describe('신청이 없는 날', () => {
  it('두 절을 아예 그리지 않는다 — 빈 상자를 두면 무슨 자리인지 묻게 된다', async () => {
    await open();

    expect(screen.queryByRole('region', { name: /신청/ })).toBeNull();
    expect(screen.queryByRole('region', { name: '보내실 곳' })).toBeNull();
  });
});

/**
 * **신청만 받고 아무것도 안 보여 주면** 손님은 접수가 된 건지 알 수 없다.
 */
describe('접수된 신청', () => {
  const panel = () => screen.getByRole('region', { name: /신청/ });
  const row = (label: string) => screen.getByText(label).parentElement!;

  it('무엇을 신청했는지 제목에 적는다', async () => {
    await open({ activeReturn: active({ type: 'EXCHANGE' }) });

    expect(panel().textContent).toContain('교환 신청');
  });

  it('상태와 사유를 사람의 말로 적는다', async () => {
    await open({ activeReturn: active({ status: 'APPROVED', reason: 'CHANGED_MIND' }) });

    expect(within(row('상태')).getByText('승인 · 회수 대기')).toBeDefined();
    expect(within(row('사유')).getByText('단순 변심 · 사이즈가 맞지 않음')).toBeDefined();
  });

  /** 반송비를 누가 내는지는 손님이 상자를 보내기 전에 알아야 하는 돈이다 */
  it.each([
    ['CUSTOMER', '고객 부담'],
    ['SELLER', '판매자 부담'],
  ])('반송비 부담(%s)을 적는다', async (borneBy, text) => {
    await open({ activeReturn: active({ shippingBorneBy: borneBy }) });

    expect(within(row('반송비')).getByText(text)).toBeDefined();
  });

  it('손님이 적어 보낸 설명을 그대로 보여 준다', async () => {
    await open({ activeReturn: active({ detail: '왼쪽 소매 실밥이 터졌습니다' }) });

    expect(within(row('설명')).getByText('왼쪽 소매 실밥이 터졌습니다')).toBeDefined();
  });

  it('설명이 없으면 그 줄을 만들지 않는다', async () => {
    await open({ activeReturn: active() });

    expect(screen.queryByText('설명')).toBeNull();
  });

  it('교환이면 어느 옵션에서 어느 옵션으로인지 적는다', async () => {
    await open({
      activeReturn: active({
        type: 'EXCHANGE',
        exchangeLines: [{ orderItemId: 'i-1', fromOptionLabel: '오트 / M', toOptionLabel: '오트 / L', quantity: 2 }],
      }),
    });

    expect(within(row('교환 내용')).getByText('울 코트 (오트 / M → 오트 / L) × 2')).toBeDefined();
  });
});

/**
 * **까닭은 끝난 신청 모두에 보여 준다.** 반려에만 보여 주다가, 승인된 교환을 무를 수 있게 되면서
 * 철회된 신청에는 "철회됨" 만 뜨고 왜인지는 어디에도 없었다 — 승인을 받고 기다리던 사람에게 그건
 * 물건이 그냥 사라진 것으로 읽힌다.
 */
describe('끝난 신청의 까닭', () => {
  it('반려는 "반려 사유" 로 적는다', async () => {
    await open({ activeReturn: active({ status: 'REJECTED', rejectReason: '사용 흔적이 있습니다' }) });

    expect(screen.getByText(/반려 사유: 사용 흔적이 있습니다/)).toBeDefined();
  });

  it('철회는 "철회 사유" 로 적는다 — 같은 칸에 다른 머리말이다', async () => {
    await open({ activeReturn: active({ status: 'CANCELLED', rejectReason: '손님 요청으로 무름' }) });

    expect(screen.getByText(/철회 사유: 손님 요청으로 무름/)).toBeDefined();
  });

  it('진행 중인 신청에는 까닭 칸이 없다', async () => {
    await open({ activeReturn: active({ status: 'APPROVED', rejectReason: '안 쓰이는 값' }) });

    expect(screen.queryByText(/사유: 안 쓰이는 값/)).toBeNull();
  });
});

/**
 * **무를 길을 여기 둔다.** 이 단추가 없던 때에는 잘못 신청하면 주문이 반품접수에 갇혀 구매확정도
 * 자동 확정도 안 됐다. 승인 전까지만이다 — 그 판단은 core 가 한다(`canCancelOwnReturn`).
 */
describe('무르기', () => {
  it('무를 수 있으면 단추를 둔다', async () => {
    await open({ activeReturn: active(), canCancelReturn: true });

    expect(screen.getByRole('button', { name: '신청 무르기' })).toBeDefined();
  });

  it('무를 수 없으면 두지 않는다 — 눌러 보고 나서 알게 하지 않는다', async () => {
    await open({ activeReturn: active(), canCancelReturn: false });

    expect(screen.queryByRole('button', { name: '신청 무르기' })).toBeNull();
  });

  it.each([
    ['EXCHANGE', 'EXCHANGE'],
    ['RETURN', 'RETURN'],
  ])('%s 신청은 그 종류로 무른다', async (type, expected) => {
    await open({ activeReturn: active({ type }), canCancelReturn: true });

    expect(screen.getByRole('button', { name: '신청 무르기' }).getAttribute('data-cancel')).toBe(expected);
  });
});

/**
 * **승인했으면 어디로 보낼지 적어 준다.** 여기가 비면 물건이 엉뚱한 곳으로 간다.
 */
describe('보내실 곳', () => {
  const box = () => screen.getByRole('region', { name: '보내실 곳' });

  it('주소를 한 줄로 적는다 — 우편번호를 앞에 둔다(송장에 옮겨 적는 순서)', async () => {
    await open({ returnTo: [destination()] });

    expect(within(box()).getByText('(04524) 서울 중구 세종대로 110 3층')).toBeDefined();
    expect(within(box()).getByText(/무어 물류/)).toBeDefined();
    expect(within(box()).getByText(/02-1234-5678/)).toBeDefined();
  });

  /** 주소가 아직 없는 판매처는 그릴 것이 없다 — 빈 상자를 내밀면 거기로 보낸다 */
  it('주소가 없는 곳은 줄을 만들지 않는다', async () => {
    await open({ returnTo: [destination({ address: null })] });

    expect(within(box()).queryAllByRole('listitem')).toHaveLength(0);
  });

  it('판매처가 하나면 상자를 나누라고 하지 않는다', async () => {
    await open({ returnTo: [destination()] });

    expect(box().textContent).not.toContain('상자를 나눠');
    // 담을 줄 목록도 적지 않는다 — 전부 한 상자다
    expect(box().textContent).not.toContain('보낼 상품');
  });

  it('판매처가 둘이면 먼저 상자를 나누라고 말하고, 주소마다 담을 줄을 적는다', async () => {
    await open({
      returnTo: [
        destination({ merchantId: 'm-1', itemIds: ['i-1'] }),
        destination({ merchantId: 'm-2', itemIds: ['i-2'], address: address({ recipient: '킨 물류' }) }),
      ],
    });

    expect(box().textContent).toContain('상자를 나눠');
    const rows = within(box()).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('울 코트 (오트 / M)');
    expect(rows[1]!.textContent).toContain('램스울 니트 (블랙 / L)');
  });

  /**
   * **알림을 누르고 들어오면 주소 한 벌이 있을 뿐이다.** 상자에 적어 둔 것이 옛 것인지 이것이 새
   * 것인지 알 수 없어서, 바뀐 자리를 짚어 줘야 사람이 적어 둔 것과 견줄 수 있다.
   */
  it('안내 뒤에 바뀐 주소면 그 사실을 먼저 말한다', async () => {
    await open({ returnTo: [destination({ changedSinceApproval: true })] });

    expect(within(box()).getByText(/바뀐 주소입니다/)).toBeDefined();
  });

  it('바뀌지 않았으면 그 말을 하지 않는다', async () => {
    await open({ returnTo: [destination()] });

    expect(within(box()).queryByText(/바뀐 주소입니다/)).toBeNull();
  });

  it('상자 겉면에 적을 주문번호를 알려 준다', async () => {
    await open({ returnTo: [destination()] });

    expect(box().textContent).toContain('20260930-0000001');
  });
});

/**
 * **새로 보낸 물건도 조회할 수 있어야 한다.** 첫 배송에는 조회 링크가 있는데 교환 송장은 번호만
 * 적혀 있어, 손님이 택배사 누리집에 번호를 옮겨 적어야 했다.
 */
describe('교환 상품 송장', () => {
  const row = () => screen.getByText('교환 상품 송장').parentElement!;

  it('택배사와 번호를 적고 조회 링크를 건다', async () => {
    await open({
      activeReturn: active({ type: 'EXCHANGE', reshipCarrier: 'CJ', reshipTrackingNumber: '123456789012' }),
    });

    const link = within(row()).getByRole('link');
    expect(link.getAttribute('href')).toContain('123456789012');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  /** 새 창으로 열리는 것을 낭독기에도 말한다 — 눈으로는 ↗ 가 그 일을 한다 */
  it('새 창임을 글자로 알린다', async () => {
    await open({
      activeReturn: active({ type: 'EXCHANGE', reshipCarrier: 'CJ', reshipTrackingNumber: '123456789012' }),
    });

    expect(within(row()).getByRole('link').textContent).toContain('(새 창)');
  });

  /** 번호는 끊어 적는다 — 열두 자리를 한 덩어리로 두면 사람이 옮겨 적다 틀린다 */
  it('번호를 끊어 적는다', async () => {
    await open({
      activeReturn: active({ type: 'EXCHANGE', reshipCarrier: 'CJ', reshipTrackingNumber: '123456789012' }),
    });

    expect(row().textContent).toContain('1234-5678-9012');
  });

  it('모르는 택배사면 번호만 적고 링크는 걸지 않는다', async () => {
    await open({
      activeReturn: active({ type: 'EXCHANGE', reshipCarrier: 'ETC', reshipTrackingNumber: '123456789012' }),
    });

    expect(within(row()).queryByRole('link')).toBeNull();
    expect(row().textContent).toContain('1234-5678-9012');
  });

  it('송장이 없으면 그 줄을 만들지 않는다', async () => {
    await open({ activeReturn: active({ type: 'EXCHANGE' }) });

    expect(screen.queryByText('교환 상품 송장')).toBeNull();
  });
});
