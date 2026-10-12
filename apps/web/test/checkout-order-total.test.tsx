// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect } from 'vitest';
import { OrderTotal } from '~/components/checkout/order-total';
import type { CartQuoteResponse } from '@shop/contract';

/**
 * 결제 금액 — **손님이 돈을 내기 직전에 읽는 숫자들.**
 *
 * 검사가 한 줄도 없었다. 간접으로 밟히기는 했지만(`checkout-form` 검사가 화면째로 그린다) 이 칸이
 * 무엇을 적고 무엇을 감추는지는 아무도 못 박지 않았다 — 할인 줄이 빠져도, 부호가 뒤집혀도,
 * 무료배송이 "0원" 으로 나가도 타입 검사는 통과한다.
 *
 * **줄마다 무엇이 빠졌는지 다 적는다.** 마지막 숫자 하나만 두면 왜 그 값이 됐는지 알 수 없고,
 * 그러면 사람은 결제 직전에 멈춘다. 반대로 **0원인 줄은 적지 않는다** — 늘 보이는 "쿠폰 할인 0원"
 * 은 읽히지 않게 되고, 정작 할인이 붙은 날에도 눈에 안 들어온다.
 */

const quote = (over: Partial<CartQuoteResponse> = {}): CartQuoteResponse =>
  ({
    lines: [],
    listTotal: 542_000,
    productDiscount: 0,
    merchandiseTotal: 542_000,
    couponDiscount: 0,
    pointsUsed: 0,
    shippingFee: 0,
    payable: 542_000,
    rewardPoints: 5_420,
    issues: [],
    ...over,
  }) as CartQuoteResponse;

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const open = (props: Partial<Parameters<typeof OrderTotal>[0]> = {}) =>
  render(<OrderTotal quote={quote()} pending={false} money={money} {...props} />);

const line = (label: string) => screen.getByText(label).parentElement!;

describe('아직 셈이 끝나지 않았을 때', () => {
  it('계산 중이라고 말한다 — 빈 자리를 두면 멈춘 것으로 보인다', () => {
    open({ pending: true });

    expect(screen.getByText('계산 중…')).toBeDefined();
  });

  it('견적이 아직 없으면 금액을 적지 않는다', () => {
    render(<OrderTotal quote={undefined} pending={false} money={money} />);

    expect(screen.getByText('계산 중…')).toBeDefined();
    expect(screen.queryByText('상품 금액')).toBeNull();
  });
});

describe('적는 줄', () => {
  it('상품 금액과 최종 금액은 늘 적는다', () => {
    open();

    expect(within(line('상품 금액')).getByText('542,000원')).toBeDefined();
    expect(screen.getByText('최종 결제 금액')).toBeDefined();
  });

  it.each([
    ['상품 할인', { productDiscount: 124_000 }],
    ['쿠폰 할인', { couponDiscount: 10_000 }],
    ['포인트 사용', { pointsUsed: 3_000 }],
  ])('%s 이 있으면 그 줄을 세운다', (label, over) => {
    open({ quote: quote(over) });

    expect(screen.getByText(label)).toBeDefined();
  });

  /** 늘 보이는 "쿠폰 할인 0원" 은 읽히지 않게 된다 — 정작 붙은 날에도 눈에 안 들어온다 */
  it.each(['상품 할인', '쿠폰 할인', '포인트 사용'])('%s 이 0이면 그 줄이 없다', (label) => {
    open();

    expect(screen.queryByText(label)).toBeNull();
  });

  /** 빠지는 돈은 부호로도 말한다 — 색만으로 가르면 색을 못 보는 사람에게는 같은 숫자다 */
  it.each([
    ['상품 할인', { productDiscount: 124_000 }, '-124,000원'],
    ['쿠폰 할인', { couponDiscount: 10_000 }, '-10,000원'],
    ['포인트 사용', { pointsUsed: 3_000 }, '-3,000원'],
  ])('%s 은 빠지는 돈이라 부호를 붙인다', (label, over, text) => {
    open({ quote: quote(over) });

    expect(within(line(label)).getByText(text)).toBeDefined();
  });
});

describe('배송비', () => {
  it('0원이면 "무료" 라고 적는다 — 0원은 사람이 쓰는 말이 아니다', () => {
    open({ quote: quote({ shippingFee: 0 }) });

    expect(within(line('배송비')).getByText('무료')).toBeDefined();
    expect(within(line('배송비')).queryByText('0원')).toBeNull();
  });

  it('붙으면 금액으로 적는다', () => {
    open({ quote: quote({ shippingFee: 3_000 }) });

    expect(within(line('배송비')).getByText('3,000원')).toBeDefined();
  });

  /** 무료배송이어도 줄은 남긴다 — 빠지면 "배송비가 얼마인지" 를 묻게 된다 */
  it('무료여도 줄을 지우지 않는다', () => {
    open({ quote: quote({ shippingFee: 0 }) });

    expect(screen.getByText('배송비')).toBeDefined();
  });
});

/**
 * **화면이 다시 셈하지 않는다.** 견적이 준 값을 그대로 그린다 — 여기서 한 번 더 계산하면 서버와
 * 어긋나는 날이 오고, 그때 어느 쪽이 맞는지 손님은 알 수 없다.
 */
describe('받은 값을 그대로 그린다', () => {
  it('최종 금액은 payable 하나만 본다', () => {
    // 줄들의 합과 일부러 어긋나게 준다 — 화면이 스스로 셈하면 여기서 드러난다
    open({ quote: quote({ listTotal: 10_000, productDiscount: 0, payable: 7_777 }) });

    expect(document.body.textContent).toContain('7,777');
  });

  it('금액 형식은 받은 함수가 정한다 — 화면이 직접 꾸미지 않는다', () => {
    open({ money: (v) => `KRW ${v}` });

    expect(within(line('상품 금액')).getByText('KRW 542000')).toBeDefined();
  });
});

describe('구조', () => {
  /** 제목 없는 구역은 낭독기에서 "어디" 인지 알 수 없다 */
  it('제목이 붙은 구역이다', () => {
    open();

    expect(screen.getByRole('region', { name: '결제 금액' })).toBeDefined();
  });

  /** 이름과 값의 짝이므로 목록이 아니라 설명 목록이다 — 낭독기가 짝으로 읽는다 */
  it('이름과 값을 짝으로 적는다', () => {
    open({ quote: quote({ couponDiscount: 10_000, shippingFee: 3_000 }) });

    const names = document.querySelectorAll('dt');
    // 상품 금액 · 쿠폰 할인 · 배송비 · 최종 결제 금액
    expect(names).toHaveLength(4);
    expect(document.querySelectorAll('dd')).toHaveLength(names.length);
    expect(document.querySelector('dl')).not.toBeNull();
  });
});
