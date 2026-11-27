// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('~/lib/analytics/client', () => ({ track: vi.fn() }));

const { ProductOptions } = await import('~/components/product-options');
const { useCartStore } = await import('~/stores/cart');

/**
 * 상품 옵션 — 키보드만으로.
 *
 * 품절 옵션을 고를 수 있게 바꾸면서(재입고 알림) 화살표가 품절 옵션에도 멈춘다. 그 길을 키보드로 끝까지 밟아 본다:
 * 탭으로 들어가 화살표로 고르고, 품절이면 이름과 알림 영역이 말해 주고, 옮겨 다닌 뒤에도 수량이 재고를 넘지 않는다.
 * axe 는 정지한 화면만 본다 — 동작은 여기서만 잡힌다.
 */
const product = {
  id: 'p-1',
  name: '나일론 코치 자켓',
  brand: 'PLAIN LABEL',
  listPrice: 129_000,
  images: [],
  optionGroups: [
    { id: 'g-c', name: '색상', values: [{ id: 'c-b', value: '블랙' }, { id: 'c-i', value: '아이보리' }] },
    { id: 'g-s', name: '사이즈', values: [{ id: 's-m', value: 'M' }, { id: 's-l', value: 'L' }, { id: 's-xl', value: 'XL' }] },
  ],
  variants: [
    { id: 'v-bm', label: '블랙 / M', price: 129_000, stock: 5, optionValueIds: ['c-b', 's-m'] },
    { id: 'v-bl', label: '블랙 / L', price: 129_000, stock: 2, optionValueIds: ['c-b', 's-l'] },
    { id: 'v-bxl', label: '블랙 / XL', price: 129_000, stock: 4, optionValueIds: ['c-b', 's-xl'] },
    { id: 'v-im', label: '아이보리 / M', price: 129_000, stock: 3, optionValueIds: ['c-i', 's-m'] },
    { id: 'v-il', label: '아이보리 / L', price: 129_000, stock: 1, optionValueIds: ['c-i', 's-l'] },
    { id: 'v-ixl', label: '아이보리 / XL', price: 129_000, stock: 0, optionValueIds: ['c-i', 's-xl'] },
  ],
} as never;

/*
 * **손잡이 안에서 터진 예외는 검사 실패로 보이지 않는다.** vitest 는 그것을
 * `Unhandled Errors` 로 따로 적고 `Tests` 줄은 그대로 "통과" 다. 담기 가드를
 * 떼어 보면 정확히 그 모양이 된다(`lineOf(null)` 이 터진다) — 그래서 세어서
 * 단정한다. 떠도는 거절을 잡을 때와 같은 방법이다.
 */
const escaped: unknown[] = [];
window.addEventListener('error', (event) => void escaped.push(event.error));

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({})));
  useCartStore.setState({ items: [] });
  escaped.length = 0;
});

const group = (name: string) => screen.getByRole('radiogroup', { name });
const status = () =>
  screen.getAllByRole('status').map((s) => s.textContent ?? '').join(' ');

describe('키보드로 옵션 고르기', () => {
  it('탭은 묶음마다 한 번만 멈추고, 화살표가 품절 옵션에도 멈춰 고른다 — 이름이 품절을 말한다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);

    await user.tab();
    expect(document.activeElement).toBe(within(group('색상')).getByRole('radio', { name: '블랙' }));
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(within(group('색상')).getByRole('radio', { name: '아이보리' }));
    expect(within(group('색상')).getByRole('radio', { name: '아이보리' }).getAttribute('aria-checked')).toBe('true');

    // 다음 탭은 사이즈 묶음의 한 칸으로 — 세 개를 다 지나지 않는다
    await user.tab();
    expect(document.activeElement).toBe(within(group('사이즈')).getByRole('radio', { name: 'M' }));
    await user.keyboard('{End}');
    const xl = within(group('사이즈')).getByRole('radio', { name: 'XL 품절' });
    expect(document.activeElement).toBe(xl);
    expect(xl.getAttribute('aria-checked')).toBe('true');

    // 끝에서 한 번 더 → 처음으로 돈다(라디오 규칙)
    await user.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(within(group('사이즈')).getByRole('radio', { name: 'M' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(within(group('사이즈')).getByRole('radio', { name: 'M' }));
  });

  it('품절 옵션에 멈추면 알림 영역이 말하고, 다음 탭이 재입고 알림 신청으로 간다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.tab();
    await user.keyboard('{ArrowRight}'); // 아이보리
    await user.tab();
    await user.keyboard('{End}'); // XL 품절

    await waitFor(() => expect(status()).toContain('아이보리 / XL 은(는) 품절입니다. 재입고 알림을 신청할 수 있습니다.'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '아이보리 / XL 재입고 알림 신청' }));
  });

  it('색을 바꿔 골라 둔 사이즈가 품절이 되면 — 초점이 색에 있어도 — 알림 영역이 말한다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.tab(); // 블랙
    await user.keyboard('{ArrowLeft}{ArrowRight}'); // 블랙을 확실히 고른다(돌아서 제자리)
    await user.tab();
    await user.keyboard('{End}'); // 블랙 / XL — 재고 있음
    expect(status()).not.toContain('품절입니다');

    await user.tab({ shift: true }); // 색으로 돌아간다
    await user.keyboard('{ArrowRight}'); // 아이보리 → 아이보리 / XL 품절
    // XL 을 골라 둔 채라 색 이름도 그 사이즈 기준으로 품절을 말한다
    expect(document.activeElement).toBe(within(group('색상')).getByRole('radio', { name: '아이보리 품절' }));
    await waitFor(() => expect(status()).toContain('아이보리 / XL 은(는) 품절입니다.'));
  });

  /*
   * **＋ 는 눌러 봤고 − 는 아무도 안 눌렀다.** 손님이 매일 누르는 자리인데,
   * 줄이기가 엉뚱하게 묶여도(늘리기로, 또는 0 까지 내려가게) 위의 검사들은
   * 그대로 통과한다. 0 으로 담기면 돈 한 푼 안 받고 주문이 서는 셈이다.
   */
  it('수량을 줄일 수 있고, 1 아래로는 내려가지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.click(within(group('색상')).getByRole('radio', { name: '블랙' }));
    await user.click(within(group('사이즈')).getByRole('radio', { name: 'M' }));

    const increase = screen.getByRole('button', { name: '수량 늘리기' });
    const decrease = screen.getByRole('button', { name: '수량 줄이기' });
    await user.click(increase);
    await user.click(increase);
    expect(screen.getByLabelText('수량 3개')).toBeTruthy();

    await user.click(decrease);
    expect(screen.getByLabelText('수량 2개')).toBeTruthy();

    // 계속 눌러도 1 에서 멈춘다 — 0 개를 담을 수는 없다
    for (let i = 0; i < 4; i += 1) await user.click(decrease);
    expect(screen.getByLabelText('수량 1개')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '장바구니 담기' }));
    expect(useCartStore.getState().items).toEqual([expect.objectContaining({ quantity: 1 })]);
  });

  /*
   * **못 누르는 단추를 눌러 본 적이 없었다.** 이 저장소는 `disabled` 대신
   * `aria-disabled` 를 쓰기로 정했는데(이유를 들을 자리를 남기려고) 그러면
   * **클릭은 그대로 들어온다** — 막는 것은 손잡이 안의 가드 한 줄뿐이다.
   * 그 줄이 사라지면 옵션을 안 고른 채 눌러도 담기가 돌아간다.
   */
  it('옵션을 고르기 전에 담기를 눌러도 아무것도 담기지 않는다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    const add = screen.getByRole('button', { name: '장바구니 담기' });
    expect(add).toHaveAttribute('aria-disabled', 'true');

    await user.click(add);

    expect(useCartStore.getState().items).toEqual([]);
    expect(escaped).toEqual([]);
  });

  it('한 벌만 고른 채 담기를 눌러도 담기지 않는다 — 조합이 아직 없다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.click(within(group('색상')).getByRole('radio', { name: '블랙' }));

    await user.click(screen.getByRole('button', { name: '장바구니 담기' }));

    expect(useCartStore.getState().items).toEqual([]);
    expect(escaped).toEqual([]);
  });

  it('수량을 올려 두고 재고가 적은 옵션으로 옮기면 그 재고까지만 담긴다', async () => {
    const user = userEvent.setup();
    render(<ProductOptions product={product} loggedIn restockOn={[]} />);
    await user.click(within(group('색상')).getByRole('radio', { name: '블랙' }));
    await user.click(within(group('사이즈')).getByRole('radio', { name: 'M' }));
    const increase = screen.getByRole('button', { name: '수량 늘리기' });
    for (let i = 0; i < 3; i += 1) await user.click(increase);
    expect(screen.getByLabelText('수량 4개')).toBeTruthy();

    // 화살표로 L(재고 2)로 — 옮기는 순간 골라진다
    within(group('사이즈')).getByRole('radio', { name: 'M' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByLabelText('수량 2개')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '장바구니 담기' }));
    expect(useCartStore.getState().items).toEqual([expect.objectContaining({ variantId: 'v-bl', quantity: 2 })]);
  });
});
