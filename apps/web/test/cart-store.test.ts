// @vitest-environment jsdom
import { beforeEach, describe, it, expect } from 'vitest';
import { useCartStore, MAX_QUANTITY, selectSelectedItems, selectAllSelected } from '~/stores/cart';

const coat = {
  variantId: 'v-coat-m', productId: 'p-coat', productName: '오버사이즈 울 블렌드 코트',
  brand: 'STUDIO NOON', optionLabel: '오트밀 / M', listPrice: 413_000, salePrice: 289_000,
};
const knit = {
  variantId: 'v-knit-l', productId: 'p-knit', productName: '램스울 크루넥 니트',
  brand: 'ATELIER K', optionLabel: '차콜 / L', listPrice: 129_000, salePrice: 129_000,
};

const items = () => useCartStore.getState().items;
const find = (id: string) => items().find((i) => i.variantId === id);

beforeEach(() => {
  useCartStore.setState({ items: [] });
  localStorage.clear();
});

describe('담기', () => {
  it('새 옵션은 줄을 추가하고 기본으로 선택된다', () => {
    useCartStore.getState().add(coat);
    expect(items()).toHaveLength(1);
    expect(find('v-coat-m')?.quantity).toBe(1);
    expect(find('v-coat-m')?.selected).toBe(true);
  });

  it('같은 옵션을 다시 담으면 줄이 늘지 않고 수량만 오른다', () => {
    const { add } = useCartStore.getState();
    add(coat);
    add(coat, 2);
    expect(items()).toHaveLength(1);
    expect(find('v-coat-m')?.quantity).toBe(3);
  });

  it('다른 옵션은 별개의 줄이다', () => {
    const { add } = useCartStore.getState();
    add(coat);
    add({ ...coat, variantId: 'v-coat-l', optionLabel: '오트밀 / L' });
    expect(items()).toHaveLength(2);
  });

  it('최대 수량을 넘겨 담을 수 없다', () => {
    useCartStore.getState().add(coat, 200);
    expect(find('v-coat-m')?.quantity).toBe(MAX_QUANTITY);
  });
});

describe('수량 조절', () => {
  beforeEach(() => useCartStore.getState().add(coat));

  it('1개 아래로는 내려가지 않는다 — 0개는 삭제라는 별도 동작이다', () => {
    const { decrement } = useCartStore.getState();
    decrement('v-coat-m');
    decrement('v-coat-m');
    expect(find('v-coat-m')?.quantity).toBe(1);
    expect(items()).toHaveLength(1);
  });

  it('최대치를 넘겨 올릴 수 없다', () => {
    useCartStore.getState().setQuantity('v-coat-m', MAX_QUANTITY);
    useCartStore.getState().increment('v-coat-m');
    expect(find('v-coat-m')?.quantity).toBe(MAX_QUANTITY);
  });

  it('직접 입력한 값이 소수여도 정수로 잘린다', () => {
    useCartStore.getState().setQuantity('v-coat-m', 3.7);
    expect(find('v-coat-m')?.quantity).toBe(3);
  });

  it('0이나 음수를 넣어도 1로 바닥을 친다', () => {
    useCartStore.getState().setQuantity('v-coat-m', 0);
    expect(find('v-coat-m')?.quantity).toBe(1);
    useCartStore.getState().setQuantity('v-coat-m', -5);
    expect(find('v-coat-m')?.quantity).toBe(1);
  });
});

describe('선택', () => {
  beforeEach(() => {
    const { add } = useCartStore.getState();
    add(coat);
    add(knit);
  });

  it('전체 선택 상태를 판별한다', () => {
    expect(selectAllSelected(useCartStore.getState())).toBe(true);
    useCartStore.getState().toggleSelected('v-coat-m');
    expect(selectAllSelected(useCartStore.getState())).toBe(false);
  });

  it('선택 해제한 항목은 주문 대상에서 빠진다', () => {
    useCartStore.getState().toggleSelected('v-coat-m');
    const selected = selectSelectedItems(useCartStore.getState());
    expect(selected).toHaveLength(1);
    expect(selected[0]?.variantId).toBe('v-knit-l');
  });

  it('선택삭제는 선택된 것만 지운다', () => {
    useCartStore.getState().toggleSelected('v-knit-l');
    useCartStore.getState().removeSelected();
    expect(items()).toHaveLength(1);
    expect(find('v-knit-l')).toBeDefined();
  });

  it('빈 장바구니는 전체선택 상태가 아니다', () => {
    useCartStore.getState().clear();
    expect(selectAllSelected(useCartStore.getState())).toBe(false);
  });
});

describe('영속화', () => {
  it('담은 내용이 localStorage에 남는다 — 비로그인 사용자도 유지돼야 한다', () => {
    useCartStore.getState().add(coat);
    const raw = localStorage.getItem('shop.cart');
    expect(raw).toBeTruthy();
    expect(JSON.parse(raw!).state.items).toHaveLength(1);
  });

  it('가격 계산 결과는 저장하지 않는다 — 금액은 서버가 정한다', () => {
    useCartStore.getState().add(coat);
    const stored = JSON.parse(localStorage.getItem('shop.cart')!).state.items[0];
    expect(stored).not.toHaveProperty('payable');
    expect(stored).not.toHaveProperty('subtotal');
  });
});

describe('옵션 바꾸기', () => {
  /*
   * 규칙 자체(자리 지키기, 합치기, 상한)는 core 가 본다. 여기서는 스토어가 그 규칙으로
   * 줄을 바꾸고, 바꾼 결과가 저장까지 이어지는지를 본다.
   */
  const coatL = { ...coat, variantId: 'v-coat-l', optionLabel: '오트밀 / L', salePrice: 299_000 };

  it('줄을 새 옵션으로 다시 적는다 — 수량·자리·선택은 그대로', () => {
    useCartStore.getState().add(knit);
    useCartStore.getState().add(coat, 2);
    useCartStore.getState().toggleSelected('v-coat-m');

    useCartStore.getState().swapVariant('v-coat-m', coatL);

    expect(items().map((i) => i.variantId)).toEqual(['v-knit-l', 'v-coat-l']);
    expect(find('v-coat-l')).toMatchObject({
      optionLabel: '오트밀 / L', salePrice: 299_000, quantity: 2, selected: false,
    });
  });

  it('바꾼 옵션이 이미 있으면 한 줄로 합친다', () => {
    useCartStore.getState().add(coatL, 1);
    useCartStore.getState().add(coat, 2);

    useCartStore.getState().swapVariant('v-coat-m', coatL);

    expect(items()).toHaveLength(1);
    expect(find('v-coat-l')?.quantity).toBe(3);
  });

  it('새로 고쳐도 남는다 — 바꾼 줄도 저장된다', () => {
    useCartStore.getState().add(coat);
    useCartStore.getState().swapVariant('v-coat-m', coatL);

    const saved = JSON.parse(localStorage.getItem('shop.cart') ?? '{}') as { state?: { items?: { variantId: string }[] } };
    expect(saved.state?.items?.map((i) => i.variantId)).toEqual(['v-coat-l']);
  });
});
