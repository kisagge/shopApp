// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import type { ReactElement } from 'react';

vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }) }));

const { AdminReturnPanel } = await import('~/app/admin/orders/[orderNo]/return-panel');
type AdminActiveReturn = NonNullable<Parameters<typeof AdminReturnPanel>[0]['activeReturn']>;

/**
 * 운영 화면의 반품·교환 한 절. **문장 여덟이 전부 안 돌았다.**
 *
 * 이 절이 하는 일은 둘이다 — 신청을 **읽을 수 있게 적는 것**과, **누구에게 어떤
 * 단추를 내놓을지 가르는 것**. 뒤쪽이 권한의 모양이다: 가맹점은 승인과 회수
 * 확인까지, **돈을 내보내는 환불은 운영진**이다. 그 선이 화면에서 흐려지면
 * 가맹점은 눌러도 안 되는 단추를 보거나, 운영진은 기다리기만 한다.
 *
 * 단추 조각들은 저마다 검사가 있다(`admin-return-actions`). 여기서 보는 것은
 * **어느 상태에 어떤 단추가 서는가**다.
 */

const Row = ({ label, value }: { label: string; value: string }): ReactElement => (
  <div>
    <dt>{label}</dt>
    <dd>{value}</dd>
  </div>
);

const active = (over: Partial<AdminActiveReturn> = {}): AdminActiveReturn => ({
  type: 'RETURN', reason: 'DEFECTIVE', status: 'REQUESTED',
  detail: null, rejectReason: null, shippingBorneBy: 'MERCHANT',
  requestedAt: new Date('2026-11-01T03:00:00Z'),
  resolvedAt: null, receivedAt: null,
  reshipCarrier: null, reshipTrackingNumber: null,
  exchangeLines: [],
  ...over,
});

type PanelProps = Parameters<typeof AdminReturnPanel>[0];

/* 신청이 없으면 null 을 돌려주므로 조각으로 감싼다 */
const panel = async (over: Partial<PanelProps> = {}) =>
  render(<>{await AdminReturnPanel({
    orderNo: '20260914-0000001',
    items: [{ id: 'i-1', productName: '울 코트' }],
    people: { resolved: null, received: null },
    activeReturn: active(),
    returnLines: [{ productName: '울 코트', optionLabel: '오트 / M', quantity: 1 }],
    isExchange: false,
    canResolveReturn: false,
    canRefundReturn: false,
    mixedReturn: false,
    returnPreview: null,
    justReceived: false,
    Row,
    ...over,
  })}</>);

const rowValue = (label: string) =>
  within(screen.getByText(label).closest('div')!).getByText((_t, el) => el?.tagName === 'DD').textContent;

describe('신청이 없으면', () => {
  it('이 절을 아예 세우지 않는다 — 없는 날에는 읽을 이유가 없다', async () => {
    const { container } = await panel({ activeReturn: null });

    expect(container).toBeEmptyDOMElement();
  });
});

describe('무엇을 돌려받는가', () => {
  it('반품이면 신청에 담긴 줄을 적는다', async () => {
    await panel();

    expect(rowValue('돌려받을 상품')).toBe('울 코트 (오트 / M) × 1');
  });

  it('교환이면 어느 옵션에서 어느 옵션으로 바꾸는지 적는다', async () => {
    await panel({
      isExchange: true,
      activeReturn: active({
        type: 'EXCHANGE',
        exchangeLines: [{ orderItemId: 'i-1', fromOptionLabel: '오트 / M', toOptionLabel: '오트 / L', quantity: 2 }],
      }),
    });

    expect(rowValue('교환할 상품')).toBe('울 코트 (오트 / M → 오트 / L) × 2');
  });

  it('줄을 못 찾으면 자리만 남긴다 — 빈 칸으로 두지 않는다', async () => {
    await panel({ returnLines: [] });

    expect(rowValue('돌려받을 상품')).toBe('—');
  });
});

describe('누가 반송비를 내는가', () => {
  it.each([
    ['CUSTOMER', '고객 부담'],
    ['MERCHANT', '판매자 부담'],
  ])('%s 이면 %s 라고 적는다', async (borneBy, expected) => {
    await panel({ activeReturn: active({ shippingBorneBy: borneBy }) });

    expect(rowValue('반송비')).toBe(expected);
  });
});

describe('무엇을 한 사람인지', () => {
  /*
   * **마무리하면 그 사람으로 덮인다.** 한 칸에 승인한 사람과 끝낸 사람이 번갈아
   * 들어오므로, 이름표가 상태를 따라가지 않으면 "승인한 사람" 자리에 환불한
   * 사람이 적힌다.
   */
  it.each([
    ['REQUESTED', '승인한 사람'],
    ['APPROVED', '승인한 사람'],
    ['REJECTED', '반려한 사람'],
    ['COMPLETED', '처리를 마친 사람'],
  ])('%s 이면 %s 라고 적는다', async (status, label) => {
    await panel({
      people: { resolved: '장보영', received: null },
      activeReturn: active({ status, resolvedAt: new Date('2026-11-02T03:00:00Z') }),
    });

    expect(screen.getByText(label)).toBeInTheDocument();
    expect(rowValue(label)).toContain('장보영');
  });

  it('아직 아무도 손대지 않았으면 그 칸이 없다', async () => {
    await panel();

    expect(screen.queryByText('승인한 사람')).toBeNull();
  });
});

describe('회수 확인 칸', () => {
  it('승인 뒤에만 선다 — 접수만 된 신청에는 물어볼 것이 없다', async () => {
    await panel();
    expect(screen.queryByText('회수 확인')).toBeNull();
  });

  it('아직 안 왔으면 그렇다고 적는다 — 빈 칸은 "확인했다" 로 읽힌다', async () => {
    await panel({ activeReturn: active({ status: 'APPROVED' }) });

    expect(rowValue('회수 확인')).toBe('아직 — 물건이 도착하면 확인합니다');
  });

  it('왔으면 그때와 확인한 사람을 함께 적는다', async () => {
    await panel({
      people: { resolved: null, received: '장병윤' },
      activeReturn: active({ status: 'APPROVED', receivedAt: new Date('2026-11-03T03:00:00Z') }),
    });

    expect(rowValue('회수 확인')).toContain('장병윤');
  });

  it('방금 확인했으면 그 사실을 한 번 알린다 — 단추가 사라지므로 화면이 대신 말한다', async () => {
    await panel({
      justReceived: true,
      activeReturn: active({ status: 'APPROVED', receivedAt: new Date('2026-11-03T03:00:00Z') }),
    });

    expect(screen.getByRole('status').textContent).toContain('도착을 확인했습니다');
  });

  it('확인되지 않았는데 알리지는 않는다', async () => {
    await panel({ justReceived: true, activeReturn: active({ status: 'APPROVED' }) });

    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('어느 단추가 서는가', () => {
  /*
   * **돈을 내보내는 환불은 운영진이다.** 가맹점은 승인과 회수 확인까지 하고,
   * 그 기록을 보고 운영진이 환불한다 — 그 선을 화면이 그린다.
   */
  const button = (name: string | RegExp) => screen.queryByRole('button', { name });

  it('접수된 신청에 처리 권한이 있으면 승인·반려를 내놓는다', async () => {
    await panel({ canResolveReturn: true });

    expect(button('반품 승인')).toBeInTheDocument();
    expect(button('반려')).toBeInTheDocument();
  });

  it('권한이 없으면 아무 단추도 없다 — 눌러도 안 되는 단추를 보여 주지 않는다', async () => {
    await panel({ canResolveReturn: false });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('가맹점은 승인 뒤 도착을 확인한다 — 환불 단추는 없다', async () => {
    await panel({
      canResolveReturn: true, canRefundReturn: false,
      activeReturn: active({ status: 'APPROVED' }),
    });

    expect(button('물건 도착 확인')).toBeInTheDocument();
    expect(button(/환불/)).toBeNull();
  });

  it('운영진에게는 환불이 선다 — 도착 확인 단추 대신이다', async () => {
    await panel({
      canResolveReturn: true, canRefundReturn: true,
      activeReturn: active({ status: 'APPROVED' }),
    });

    expect(button('회수 확인 · 환불')).toBeInTheDocument();
    expect(button('물건 도착 확인')).toBeNull();
  });

  it('가맹점이 이미 확인했으면 운영진은 환불만 한다', async () => {
    await panel({
      canResolveReturn: true, canRefundReturn: true,
      activeReturn: active({ status: 'APPROVED', receivedAt: new Date('2026-11-03T03:00:00Z') }),
    });

    expect(button('환불')).toBeInTheDocument();
  });

  it('교환은 돈이 안 움직여 처리 권한으로 끝까지 한다 — 환불 대신 교환 상품 발송', async () => {
    await panel({
      isExchange: true, canResolveReturn: true, canRefundReturn: false,
      activeReturn: active({ type: 'EXCHANGE', status: 'APPROVED' }),
    });

    expect(button('회수 확인 · 교환 상품 발송')).toBeInTheDocument();
    expect(button('물건 도착 확인')).toBeNull();
  });

  it('교환에는 환불 권한이 있어도 환불 단추가 없다 — 돈이 움직이지 않는다', async () => {
    /*
     * 운영진이 교환을 보고 있을 때다. 돌려줄 돈이 없는데 환불 단추가 서면,
     * 누르면 창구가 튕기거나 — 더 나쁘게 — 돈이 나간다.
     */
    await panel({
      isExchange: true, canResolveReturn: true, canRefundReturn: true,
      activeReturn: active({ type: 'EXCHANGE', status: 'APPROVED' }),
    });

    expect(button(/환불/)).toBeNull();
    expect(button('회수 확인 · 교환 상품 발송')).toBeInTheDocument();
  });

  it('승인한 뒤에도 무를 수 있다 — 물건이 안 오면 되돌릴 길이 있어야 한다', async () => {
    await panel({ canResolveReturn: true, activeReturn: active({ status: 'APPROVED' }) });

    expect(button('승인 철회')).toBeInTheDocument();
  });

  it('이미 끝난 신청에는 단추를 두지 않는다 — 두 번 누르게 된다', async () => {
    await panel({
      canResolveReturn: true, canRefundReturn: true,
      activeReturn: active({ status: 'COMPLETED', resolvedAt: new Date('2026-11-04T03:00:00Z') }),
    });

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

describe('섞인 반품', () => {
  it('내 차례가 아니라고 적는다 — 서로 기다리지 않게', async () => {
    await panel({ mixedReturn: true });

    expect(screen.getByText(/다른 가맹점 상품이 함께 신청된 반품/)).toBeInTheDocument();
  });

  it('섞이지 않았으면 그 말을 하지 않는다', async () => {
    await panel();

    expect(screen.queryByText(/다른 가맹점 상품이 함께/)).toBeNull();
  });
});

describe('교환 송장', () => {
  it('보냈으면 택배사 이름과 끊어 읽는 번호로 적는다', async () => {
    await panel({
      isExchange: true,
      activeReturn: active({
        type: 'EXCHANGE', status: 'COMPLETED',
        reshipCarrier: 'CJ', reshipTrackingNumber: '123456789012',
      }),
    });

    expect(rowValue('교환 송장')).toContain('CJ대한통운');
    expect(rowValue('교환 송장')).not.toBe('CJ대한통운 123456789012');
  });

  it('안 보냈으면 그 칸이 없다', async () => {
    await panel();

    expect(screen.queryByText('교환 송장')).toBeNull();
  });
});
