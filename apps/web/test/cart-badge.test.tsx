// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, beforeEach } from 'vitest';
import { CartBadge } from '~/components/cart-badge';
import { useCartStore } from '~/stores/cart';

/**
 * 머리의 장바구니 링크.
 *
 * **보이는 말이 이름 안에 들어 있어야 한다.** 보이는 것은 `장바구니` 와 뱃지의 숫자인데, 그 둘이 글자
 * 흐름에서 붙으면 `장바구니1` **한 낱말**이 된다 — 한글과 숫자는 둘 다 "글자" 라서 그렇다. 그러면
 * 이름(`장바구니, 1 개`) 안에 그 말이 든 것으로 읽히지 않고, 눈에 보이는 말로 음성 조작하는 사람에게는
 * 닿지 않을 수 있다.
 *
 * axe 4.14 가 손님 화면 둘에서 이것을 잡았다(4.13 은 글자 포함만 봐서 통과시켰다). 고침은 **낱말을
 * 가르는 공백 하나**이고, 여백을 주는 margin 과는 다른 일이라 지워지기 쉽다 — 그래서 여기서 지킨다.
 *
 * 이 조각에는 검사가 없었다.
 */

/** 장바구니 한 줄. 뱃지가 세는 것은 **줄 수**다(수량이 아니다 — selectItemCount) */
const line = (variantId: string) => ({
  variantId,
  productId: `p-${variantId}`,
  productName: '울 코트',
  brand: 'MOOR',
  optionLabel: '오트 / M',
  listPrice: 390_000,
  salePrice: 312_000,
  quantity: 1,
  selected: true,
  addedAt: Date.now(),
});

beforeEach(() => useCartStore.setState({ items: [] }));

const link = () => screen.getByRole('link');

describe('담은 것이 없으면', () => {
  it('이름은 그냥 장바구니다', async () => {
    render(<CartBadge />);
    await waitFor(() => expect(link()).toHaveAttribute('aria-label', '장바구니'));
  });

  it('숫자를 그리지 않는다', () => {
    const { container } = render(<CartBadge />);
    expect(container.querySelector('span')).toBeNull();
  });
});

describe('담은 것이 있으면', () => {
  beforeEach(() => useCartStore.setState({ items: [line('v-1'), line('v-2')] as never }));

  it('이름에 개수가 들어가고, 숫자가 낱말로 떨어져 있다', async () => {
    render(<CartBadge />);
    await waitFor(() => expect(link()).toHaveAttribute('aria-label', '장바구니, 2 개'));
  });

  it('보이는 글자에서도 숫자가 붙지 않는다', async () => {
    /*
     * **여백(margin)으로는 안 된다.** 낱말을 가르는 것은 글자 사이의 공백이고, 그것이 없으면
     * `장바구니2` 한 덩어리가 된다 — 눈으로는 똑같이 떨어져 보이므로 지워도 아무도 모른다.
     */
    render(<CartBadge />);
    await waitFor(() => expect(link().textContent).toBe('장바구니 2'));
  });

  it('숫자는 읽히지 않는다 — 개수는 이름이 말한다', async () => {
    const { container } = render(<CartBadge />);
    await waitFor(() =>
      expect(container.querySelector('span')?.getAttribute('aria-hidden')).toBe('true'),
    );
  });

  it('장바구니로 간다', () => {
    render(<CartBadge />);
    expect(link()).toHaveAttribute('href', '/cart');
  });
});
