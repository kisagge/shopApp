import { describe, it, expect } from 'vitest';
import {
  variantUnavailable, swapLineVariant, planReorder,
  type VariantState, type ReorderVariant,
} from '../src/cart-line';
import { MAX_CART_LINES, MAX_QUANTITY } from '../src/cart-sync';

const live: VariantState = {
  isActive: true, productStatus: 'ACTIVE', productDeleted: false, merchantStatus: 'APPROVED',
};

describe('담을 수 있는 옵션인가', () => {
  it('판매 중이면 담는다', () => {
    expect(variantUnavailable(live)).toBeNull();
  });

  it('자사 직매입 브랜드는 가맹점이 없어도 담는다', () => {
    expect(variantUnavailable({ ...live, merchantStatus: null })).toBeNull();
  });

  it('품절(SOLD_OUT 상태)인 상품도 "담을 수 없다" 는 아니다 — 재고는 따로 본다', () => {
    expect(variantUnavailable({ ...live, productStatus: 'SOLD_OUT' })).toBeNull();
  });

  it.each([
    ['행이 없다', null],
    ['상품이 지워졌다', { ...live, productDeleted: true }],
    ['작성 중이다', { ...live, productStatus: 'DRAFT' as const }],
  ])('%s — 없는 것', (_label, v) => {
    expect(variantUnavailable(v)).toBe('NOT_FOUND');
  });

  it.each([
    ['옵션 판매를 멈췄다', { ...live, isActive: false }],
    ['상품을 숨겼다', { ...live, productStatus: 'HIDDEN' as const }],
    ['가맹점이 정지됐다', { ...live, merchantStatus: 'SUSPENDED' }],
  ])('%s — 팔지 않는 것', (_label, v) => {
    /*
     * 가맹점 정지가 빠지기 쉽다. 상품 상태만 보면 정지 처분이 판매를 멈추지 못하고,
     * 옵션 바꾸기가 그 가게의 옵션으로 바꿔 담게 해 놓고 견적에서 막는다.
     */
    expect(variantUnavailable(v)).toBe('INACTIVE');
  });
});

type Line = { variantId: string; quantity: number; selected: boolean; label: string };
const line = (variantId: string, quantity = 1, selected = true): Line =>
  ({ variantId, quantity, selected, label: variantId.toUpperCase() });

describe('옵션 바꾸기', () => {
  it('그 자리에서 바꾼다 — 맨 뒤로 가면 방금 바꾼 줄을 찾아야 한다', () => {
    const lines = [line('a'), line('l', 2), line('b')];

    const next = swapLineVariant(lines, 'l', { variantId: 'm', label: 'M' });

    expect(next.map((l) => l.variantId)).toEqual(['a', 'm', 'b']);
  });

  it('수량과 선택을 그대로 옮긴다', () => {
    const next = swapLineVariant([line('l', 3, false)], 'l', { variantId: 'm', label: 'M' });

    expect(next[0]).toEqual({ variantId: 'm', label: 'M', quantity: 3, selected: false });
  });

  it('새 옵션의 값으로 줄을 다시 적는다', () => {
    const next = swapLineVariant([line('l')], 'l', { variantId: 'm', label: '오트 / M' });
    expect(next[0]!.label).toBe('오트 / M');
  });

  it('바꾸려는 옵션이 이미 담겨 있으면 한 줄로 합치고 수량을 더한다', () => {
    /*
     * 같은 옵션이 두 줄이면 저장(variantId 가 열쇠)에서 한 줄이 사라진다.
     * 로그인 병합은 큰 쪽을 고르지만 여기는 L 2개와 M 1개를 따로 원했던 사람이다.
     */
    const lines = [line('m', 1), line('a'), line('l', 2)];

    const next = swapLineVariant(lines, 'l', { variantId: 'm', label: 'M' });

    expect(next.map((l) => [l.variantId, l.quantity])).toEqual([['a', 1], ['m', 3]]);
  });

  it('합쳐도 상한을 넘지 않는다', () => {
    const next = swapLineVariant([line('m', 90), line('l', 20)], 'l', { variantId: 'm', label: 'M' });
    expect(next[0]!.quantity).toBe(MAX_QUANTITY);
  });

  it('둘 중 하나라도 골라 둔 것이면 고른 채로 둔다', () => {
    const next = swapLineVariant([line('m', 1, false), line('l', 1, true)], 'l', { variantId: 'm', label: 'M' });
    expect(next[0]!.selected).toBe(true);
  });

  it('없는 줄이나 같은 옵션이면 아무것도 바꾸지 않는다', () => {
    const lines = [line('l')];
    expect(swapLineVariant(lines, 'x', { variantId: 'm', label: 'M' })).toEqual(lines);
    expect(swapLineVariant(lines, 'l', { variantId: 'l', label: 'L' })).toEqual(lines);
  });

  it('받은 배열을 고치지 않는다', () => {
    const lines = [line('l')];
    swapLineVariant(lines, 'l', { variantId: 'm', label: 'M' });
    expect(lines[0]!.variantId).toBe('l');
  });
});

const stocked = (stock: number, over: Partial<VariantState> = {}): ReorderVariant => ({ ...live, ...over, stock });

describe('다시 담기', () => {
  it('주문한 만큼 담는다', () => {
    const plan = planReorder(
      [{ variantId: 'a', quantity: 2, canceled: false }],
      new Map([['a', stocked(10)]]),
      new Set(),
    );
    expect(plan).toEqual({ add: [{ variantId: 'a', quantity: 2, reduced: false }], skipped: [] });
  });

  it('재고만큼만 담고, 줄였다고 말한다', () => {
    const plan = planReorder(
      [{ variantId: 'a', quantity: 3, canceled: false }],
      new Map([['a', stocked(2)]]),
      new Set(),
    );
    expect(plan.add).toEqual([{ variantId: 'a', quantity: 2, reduced: true }]);
  });

  it('하나가 품절이어도 나머지는 담는다 — 통째로 실패시키지 않는다', () => {
    const plan = planReorder(
      [
        { variantId: 'a', quantity: 1, canceled: false },
        { variantId: 'b', quantity: 1, canceled: false },
      ],
      new Map([['a', stocked(0)], ['b', stocked(5)]]),
      new Set(),
    );
    expect(plan.add.map((l) => l.variantId)).toEqual(['b']);
    expect(plan.skipped).toEqual([{ variantId: 'a', reason: 'SOLD_OUT' }]);
  });

  it('취소·반품한 줄은 담지 않는다 — 돌려보낸 것을 다시 담으면 뜻밖이다', () => {
    const plan = planReorder(
      [{ variantId: 'a', quantity: 1, canceled: true }],
      new Map([['a', stocked(5)]]),
      new Set(),
    );
    expect(plan).toEqual({ add: [], skipped: [{ variantId: 'a', reason: 'CANCELED' }] });
  });

  it.each([
    ['상품이 사라졌다', null],
    ['판매를 멈췄다', stocked(5, { isActive: false })],
    ['가맹점이 정지됐다', stocked(5, { merchantStatus: 'SUSPENDED' })],
  ])('%s — 팔지 않는 것은 담지 않는다', (_label, v) => {
    const plan = planReorder(
      [{ variantId: 'a', quantity: 1, canceled: false }],
      new Map([['a', v]]),
      new Set(),
    );
    expect(plan.skipped).toEqual([{ variantId: 'a', reason: 'UNAVAILABLE' }]);
  });

  it('같은 옵션이 두 줄이면 합쳐서 본다', () => {
    const plan = planReorder(
      [
        { variantId: 'a', quantity: 1, canceled: false },
        { variantId: 'a', quantity: 2, canceled: false },
      ],
      new Map([['a', stocked(10)]]),
      new Set(),
    );
    expect(plan.add).toEqual([{ variantId: 'a', quantity: 3, reduced: false }]);
  });

  it('줄 수 상한을 넘기지 않는다 — 넘친 것은 까닭과 함께 돌려준다', () => {
    const full = new Set(Array.from({ length: MAX_CART_LINES - 1 }, (_, i) => `c${i}`));
    const plan = planReorder(
      [
        { variantId: 'a', quantity: 1, canceled: false },
        { variantId: 'b', quantity: 1, canceled: false },
      ],
      new Map([['a', stocked(5)], ['b', stocked(5)]]),
      full,
    );
    expect(plan.add.map((l) => l.variantId)).toEqual(['a']);
    expect(plan.skipped).toEqual([{ variantId: 'b', reason: 'CART_FULL' }]);
  });

  it('이미 담긴 옵션은 줄이 늘지 않으니 상한에 세지 않는다', () => {
    const full = new Set(Array.from({ length: MAX_CART_LINES }, (_, i) => (i === 0 ? 'a' : `c${i}`)));
    const plan = planReorder(
      [{ variantId: 'a', quantity: 1, canceled: false }],
      new Map([['a', stocked(5)]]),
      full,
    );
    expect(plan.add.map((l) => l.variantId)).toEqual(['a']);
  });
});
