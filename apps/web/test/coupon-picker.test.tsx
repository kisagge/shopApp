// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen } from './render';
import type { CartCouponOffer } from '@shop/contract';
import { CouponPicker } from '~/components/checkout/coupon-picker';

const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;

type Unusable = CartCouponOffer['unusable'];
const offer = (code: string, discount: number, name = `${code} 쿠폰`, unusable: Unusable = null): CartCouponOffer => ({
  code, name, discount, expiresAt: '2026-12-31T00:00:00.000Z', unusable,
});

describe('쿠폰 고르기', () => {
  it('가진 쿠폰이 없으면 자리를 만들지 않는다 — 빈 상자는 화면만 길어진다', () => {
    const { container } = render(
      <CouponPicker offers={[]} selected={null} onSelect={vi.fn()} money={money} autoPicked={false} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  /** 이름만으로는 어느 것이 유리한지 알 수 없다 */
  it('쿠폰마다 얼마가 깎이는지 함께 적는다', () => {
    render(
      <CouponPicker offers={[offer('A', 20_000)]} selected="A" onSelect={vi.fn()} money={money} autoPicked={false} />,
    );

    expect(screen.getByText('-20,000원')).toBeInTheDocument();
  });

  /**
   * 목록에서 빼면 "내 쿠폰이 어디 갔지" 가 되고, 조금 더 담으면 쓸 수 있다는
   * 사실도 함께 사라진다. 대신 고를 수 없게 잠근다.
   */
  it('못 쓰는 쿠폰은 남기되 잠근다', () => {
    render(
      <CouponPicker
        offers={[offer('OK', 5_000), offer('NO', 0)]}
        selected="OK"
        onSelect={vi.fn()}
        money={money}
        autoPicked={false}
      />,
    );

    expect(screen.getByRole('radio', { name: /NO 쿠폰/ })).toBeDisabled();
    expect(screen.getByText('이 주문에는 쓸 수 없음')).toBeInTheDocument();
  });

  it('라디오다 — 눌러 보지 않아도 무엇이 붙어 있는지 보인다', () => {
    render(
      <CouponPicker
        offers={[offer('A', 20_000), offer('B', 5_000)]}
        selected="B"
        onSelect={vi.fn()}
        money={money}
        autoPicked={false}
      />,
    );

    expect(screen.getByRole('radio', { name: /B 쿠폰/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /A 쿠폰/ })).not.toBeChecked();
  });

  it('쓰지 않기를 고를 수 있다 — 다음에 쓰려고 아껴 두는 사람이 있다', async () => {
    const onSelect = vi.fn();
    render(
      <CouponPicker offers={[offer('A', 20_000)]} selected="A" onSelect={onSelect} money={money} autoPicked={false} />,
    );

    await userEvent.click(screen.getByRole('radio', { name: '쿠폰 쓰지 않기' }));

    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('고르면 그 코드를 알려 준다', async () => {
    const onSelect = vi.fn();
    render(
      <CouponPicker
        offers={[offer('A', 20_000), offer('B', 5_000)]}
        selected={null}
        onSelect={onSelect}
        money={money}
        autoPicked={false}
      />,
    );

    await userEvent.click(screen.getByRole('radio', { name: /B 쿠폰/ }));

    expect(onSelect).toHaveBeenCalledWith('B');
  });

  it('쓸 수 있는 장수를 제목에 적는다', () => {
    render(
      <CouponPicker
        offers={[offer('A', 5_000), offer('B', 0), offer('C', 3_000)]}
        selected="A"
        onSelect={vi.fn()}
        money={money}
        autoPicked={false}
      />,
    );

    expect(screen.getByRole('group', { name: /2장 사용 가능/ })).toBeInTheDocument();
  });
});

describe('우리가 골라 준 것', () => {
  /** 말하지 않으면 쿠폰이 저절로 붙은 것처럼 보인다 */
  it('우리가 골랐으면 그렇다고 말한다', () => {
    render(
      <CouponPicker
        offers={[offer('A', 20_000)]}
        selected="A"
        autoPicked
        onSelect={vi.fn()}
        money={money}
      />,
    );

    expect(screen.getByText(/골라 두었습니다/)).toBeInTheDocument();
  });

  it('사람이 고른 뒤에는 말하지 않는다', () => {
    render(
      <CouponPicker
        offers={[offer('A', 20_000)]}
        selected="A"
        autoPicked={false}
        onSelect={vi.fn()}
        money={money}
      />,
    );

    expect(screen.queryByText(/골라 두었습니다/)).toBeNull();
  });
});

/**
 * **왜 못 쓰는지 말한다.** "이 주문에는 쓸 수 없음" 한 마디로는 대상 상품이 없어서인지 조금 모자라서인지 알 수
 * 없었다. 잠긴 단추에 그 까닭을 잇는다 — 옆 글자만으로는 낭독기가 이 단추의 설명으로 읽지 않는다.
 */
describe('못 쓰는 까닭', () => {
  it('모자라면 얼마를 더 담으면 되는지 말하고, 잠긴 단추의 설명으로 잇는다', () => {
    render(
      <CouponPicker
        offers={[offer('MIN', 0, '5만원 이상 쿠폰', { reason: 'BELOW_MINIMUM', minimum: 50_000, shortfall: 12_000 })]}
        selected={null}
        onSelect={vi.fn()}
        money={money}
        autoPicked={false}
      />,
    );

    const radio = screen.getByRole('radio', { name: /5만원 이상 쿠폰/ });
    expect(radio).toBeDisabled();
    expect(radio).toHaveAccessibleDescription('대상 상품 50,000원 이상부터 — 12,000원 더 담으면 쓸 수 있어요');
  });

  it('대상 상품이 없으면 그렇게 말한다', () => {
    render(
      <CouponPicker
        offers={[offer('BRAND', 0, '브랜드 쿠폰', { reason: 'NO_ELIGIBLE_ITEMS' })]}
        selected={null}
        onSelect={vi.fn()}
        money={money}
        autoPicked={false}
      />,
    );

    expect(screen.getByRole('radio', { name: /브랜드 쿠폰/ }))
      .toHaveAccessibleDescription('담은 상품 중 쿠폰 대상이 없어요');
  });

  it('쓸 수 있는 쿠폰에는 까닭을 달지 않는다', () => {
    render(
      <CouponPicker offers={[offer('OK', 5_000)]} selected="OK" onSelect={vi.fn()} money={money} autoPicked={false} />,
    );

    expect(screen.getByRole('radio', { name: /OK 쿠폰/ })).not.toHaveAttribute('aria-describedby');
  });
});
