import { describe, it, expect } from 'vitest';
import { checkRestockEligibility, becameAvailable } from '../src/restock';

const ok = { stock: 0, isActive: true, productSellable: true };

describe('알림을 걸 수 있는 조건', () => {
  it('품절이고 팔고 있는 옵션이면 걸 수 있다', () => {
    expect(checkRestockEligibility(ok)).toEqual({ ok: true });
  });

  it('재고가 있으면 걸 수 없다 — 영원히 안 울리는 알림이 쌓인다', () => {
    expect(checkRestockEligibility({ ...ok, stock: 3 })).toMatchObject({
      ok: false, code: 'IN_STOCK',
    });
  });

  it('판매를 내린 옵션에는 걸 수 없다', () => {
    expect(checkRestockEligibility({ ...ok, isActive: false })).toMatchObject({
      ok: false, code: 'VARIANT_INACTIVE',
    });
  });

  it('판매하지 않는 상품에는 걸 수 없다 — 다시 올릴지 알 수 없다', () => {
    expect(checkRestockEligibility({ ...ok, productSellable: false })).toMatchObject({
      ok: false, code: 'NOT_SELLABLE',
    });
  });

  it('상품이 내려갔으면 옵션 상태보다 그것이 먼저다', () => {
    expect(
      checkRestockEligibility({ stock: 0, isActive: false, productSellable: false }),
    ).toMatchObject({ code: 'NOT_SELLABLE' });
  });
});

describe('재입고 판정', () => {
  it('없다가 생기면 재입고다', () => {
    expect(becameAvailable(0, 5)).toBe(true);
  });

  it('있던 재고를 줄이는 것은 재입고가 아니다 — 평범한 수정에 알림이 나가면 안 된다', () => {
    expect(becameAvailable(10, 8)).toBe(false);
  });

  it('늘려도 원래 있었으면 아니다', () => {
    expect(becameAvailable(3, 30)).toBe(false);
  });

  it('없던 것이 그대로 없으면 아니다', () => {
    expect(becameAvailable(0, 0)).toBe(false);
  });

  it('음수 재고에서 올라와도 재입고다', () => {
    // 데이터가 어긋나 음수가 되는 일이 있다. 0 이하는 다 없는 것으로 본다.
    expect(becameAvailable(-2, 5)).toBe(true);
  });
});
