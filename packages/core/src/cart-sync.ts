/**
 * 장바구니 병합 규칙. 순수 로직만.
 *
 * 비로그인으로 담아 두었다가 로그인하면 두 장바구니가 만난다.
 * 어느 쪽도 버리지 않고 합치되, **수량을 더하지 않는다.**
 */

export const MAX_QUANTITY = 99;
/** 한 장바구니가 가질 수 있는 줄 수. 이보다 많으면 담은 게 아니라 쌓아 둔 것이다. */
export const MAX_CART_LINES = 50;

export interface CartLineState {
  readonly variantId: string;
  readonly quantity: number;
  readonly selected: boolean;
}

/**
 * 로컬 장바구니와 서버 장바구니를 합친다.
 *
 * 같은 옵션이 양쪽에 있으면 **큰 쪽을 쓴다. 더하지 않는다.**
 * 폰에서 2개 담고 노트북에서 1개 담았다면 원하는 건 3개가 아니라 2개다.
 * 대개 같은 물건을 다시 담은 것이지 추가로 담은 것이 아니기 때문이다.
 * 더하면 로그인할 때마다 수량이 불어난다.
 *
 * 선택 상태는 로컬을 따른다 — 방금 한 행동이 더 최근의 의사다.
 */
export function mergeCartLines(
  local: readonly CartLineState[],
  server: readonly CartLineState[],
): CartLineState[] {
  const merged = new Map<string, CartLineState>();

  for (const line of server) {
    merged.set(line.variantId, clampLine(line));
  }

  for (const line of local) {
    const existing = merged.get(line.variantId);
    merged.set(
      line.variantId,
      clampLine({
        variantId: line.variantId,
        quantity: existing ? Math.max(existing.quantity, line.quantity) : line.quantity,
        selected: line.selected,
      }),
    );
  }

  // 넘치면 **서버에 있던 것부터 남긴다.** 로컬은 방금 담은 것이라
  // 다시 담기 쉽지만, 서버 것은 다른 기기에서 담아 둔 것이라 되찾기 어렵다.
  return [...merged.values()].slice(0, MAX_CART_LINES);
}

function clampLine(line: CartLineState): CartLineState {
  return {
    variantId: line.variantId,
    quantity: Math.min(Math.max(1, Math.floor(line.quantity)), MAX_QUANTITY),
    selected: line.selected,
  };
}

/** 두 장바구니가 같은 내용인가 — 불필요한 저장 요청을 막는 데 쓴다. */
export function sameCart(a: readonly CartLineState[], b: readonly CartLineState[]): boolean {
  if (a.length !== b.length) return false;
  const byId = new Map(b.map((l) => [l.variantId, l]));
  return a.every((line) => {
    const other = byId.get(line.variantId);
    return other?.quantity === line.quantity && other.selected === line.selected;
  });
}
