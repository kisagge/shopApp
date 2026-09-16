import type { ProductStatus } from './product-publish';
import type { LineIssue } from './cart';
import { MAX_CART_LINES, MAX_QUANTITY, type CartLineState } from './cart-sync';

/**
 * 장바구니 한 줄을 다루는 규칙 — 팔 수 있는가, 옵션을 바꾸면 어떻게 되는가,
 * 지난 주문을 다시 담으면 무엇이 담기는가. 순수 로직만.
 */

/** 옵션 하나를 두고 판정에 필요한 것. 행이 없으면 null 로 넘긴다 */
export interface VariantState {
  readonly isActive: boolean;
  readonly productStatus: ProductStatus;
  readonly productDeleted: boolean;
  /** 입점 가맹점의 상태. 자사 직매입 브랜드는 가맹점이 없어 null 이다 */
  readonly merchantStatus: string | null;
}

/**
 * 이 옵션을 지금 **담을 수 없는 이유.** 담을 수 있으면 null.
 *
 * 견적(quoteCart)이 줄마다 적던 판단을 꺼냈다. 옵션을 바꾸는 창구와 다시 담는
 * 창구가 생기면서 같은 판단이 셋째·넷째 자리에 필요해졌는데, 따로 적으면 셋 중
 * 하나만 "가맹점 정지" 를 빠뜨린다 — 그러면 정지된 가게의 옵션으로 바꿔 담게
 * 해 놓고 견적에서 막는다.
 *
 * 재고는 보지 않는다. 품절은 "담을 수 없다" 가 아니라 "지금은 살 수 없다" 여서
 * 부르는 쪽마다 다루는 법이 다르다(견적은 알리고, 다시 담기는 건너뛴다).
 */
export function variantUnavailable(v: VariantState | null): Extract<LineIssue, 'NOT_FOUND' | 'INACTIVE'> | null {
  // 상품이 사라졌거나 아직 올라간 적이 없다
  if (v === null || v.productDeleted || v.productStatus === 'DRAFT') return 'NOT_FOUND';
  if (
    !v.isActive
    || v.productStatus === 'HIDDEN'
    // 가맹점이 정지되면 그 상품은 팔 수 없다. 상품 상태만 보면 정지 처분이 판매를 멈추지 못한다
    || (v.merchantStatus ?? 'APPROVED') !== 'APPROVED'
  ) {
    return 'INACTIVE';
  }
  return null;
}

/**
 * 한 줄의 옵션을 바꾼다.
 *
 * **"L 이 품절입니다" 라고만 하고 바꿀 길이 없었다.** 장바구니에서 할 수 있는 일은
 * 지우는 것뿐이라, 같은 상품의 M 을 사려면 상품 화면으로 돌아가 다시 골라 담고
 * 여기 와서 L 을 지워야 했다.
 *
 * · **자리를 지킨다.** 누른 줄이 그 자리에서 바뀐다. 맨 뒤로 가면 방금 바꾼 줄을 찾아야 한다.
 * · **수량과 선택을 그대로 옮긴다.** 새 옵션의 재고가 모자라면 견적이 알린다 — 여기서
 *   조용히 줄이면 사람이 고른 수가 말없이 바뀐다.
 * · **바꾸려는 옵션이 이미 담겨 있으면 한 줄로 합친다.** 같은 옵션이 두 줄이면 저장
 *   (variantId 가 열쇠다)에서 한 줄이 사라진다. 이때는 **더한다** — 로그인 병합이 큰
 *   쪽을 고르는 것과 다르다. 저건 같은 뜻이 두 기기에 남은 것이고, 이건 L 2개와 M 1개를
 *   따로 원했던 사람이 L 을 M 으로 바꾼 것이다.
 */
export function swapLineVariant<T extends CartLineState>(
  lines: readonly T[],
  fromVariantId: string,
  to: Omit<T, 'quantity' | 'selected'>,
): T[] {
  const from = lines.find((l) => l.variantId === fromVariantId);
  if (!from || from.variantId === to.variantId) return [...lines];

  const existing = lines.find((l) => l.variantId === to.variantId);
  const next = {
    ...to,
    quantity: Math.min(MAX_QUANTITY, from.quantity + (existing?.quantity ?? 0)),
    // 둘 중 하나라도 사려고 골라 둔 것이면 고른 채로 둔다
    selected: from.selected || (existing?.selected ?? false),
  } as unknown as T;

  return lines
    .filter((l) => l.variantId !== to.variantId)
    .map((l) => (l.variantId === fromVariantId ? next : l));
}

/** 지난 주문의 한 줄 */
export interface ReorderSource {
  readonly variantId: string;
  readonly quantity: number;
  /** 취소·반품으로 돈이 돌아간 줄 */
  readonly canceled: boolean;
}

/** 지금 그 옵션의 형편. 행이 없으면 null */
export type ReorderVariant = (VariantState & { readonly stock: number }) | null;

export const REORDER_SKIP = [
  /** 취소·반품한 줄 — 돌려보낸 것을 다시 담으면 뜻밖이다 */
  'CANCELED',
  /** 상품이 내려갔거나 옵션 판매가 멈췄다 */
  'UNAVAILABLE',
  'SOLD_OUT',
  /** 장바구니 줄 수 상한 */
  'CART_FULL',
] as const;
export type ReorderSkip = (typeof REORDER_SKIP)[number];

export interface ReorderPlan {
  readonly add: readonly {
    readonly variantId: string;
    readonly quantity: number;
    /** 재고가 모자라 주문 때보다 적게 담았다 */
    readonly reduced: boolean;
  }[];
  readonly skipped: readonly { readonly variantId: string; readonly reason: ReorderSkip }[];
}

/**
 * 지난 주문을 다시 담으면 무엇이 몇 개 담기는가.
 *
 * **다시 사는 길이 어디에도 없었다.** 같은 양말을 철마다 사는 사람도 상품을 하나씩
 * 찾아 옵션을 다시 골라야 했다. 주문 줄은 옵션 id 를 그대로 갖고 있는데(스키마
 * 주석에 "재구매에 쓴다" 고까지 적혀 있다) 그 길을 연결하지 않았다.
 *
 * · **담을 수 있는 것만 담고, 못 담은 것은 까닭과 함께 돌려준다.** 통째로 실패시키면
 *   열 개 중 하나가 품절이라는 이유로 아홉 개도 못 담는다. 말없이 빼면 빠진 줄 모른다.
 * · **재고만큼만.** 주문 때 3개였어도 지금 2개 남았으면 2개를 담고 줄였다고 말한다.
 * · **줄 수 상한을 지킨다.** 이미 담긴 옵션은 줄이 늘지 않으니 세지 않는다. 넘치는
 *   것은 담지 않는다 — 저장소는 상한을 넘은 장바구니를 받지 않는다.
 * · 한 주문에 같은 옵션이 두 줄이면(교환 등) 합쳐서 본다.
 */
export function planReorder(
  items: readonly ReorderSource[],
  variants: ReadonlyMap<string, ReorderVariant>,
  cartVariantIds: ReadonlySet<string>,
): ReorderPlan {
  const wanted = new Map<string, number>();
  const skipped: { variantId: string; reason: ReorderSkip }[] = [];

  for (const item of items) {
    if (item.canceled) {
      skipped.push({ variantId: item.variantId, reason: 'CANCELED' });
      continue;
    }
    wanted.set(item.variantId, (wanted.get(item.variantId) ?? 0) + item.quantity);
  }

  const add: { variantId: string; quantity: number; reduced: boolean }[] = [];
  let lines = cartVariantIds.size;

  for (const [variantId, ordered] of wanted) {
    const v = variants.get(variantId) ?? null;
    if (v === null || variantUnavailable(v) !== null) {
      skipped.push({ variantId, reason: 'UNAVAILABLE' });
      continue;
    }
    const stock = Math.max(0, v.stock);
    if (stock === 0) {
      skipped.push({ variantId, reason: 'SOLD_OUT' });
      continue;
    }

    const isNewLine = !cartVariantIds.has(variantId);
    if (isNewLine && lines >= MAX_CART_LINES) {
      skipped.push({ variantId, reason: 'CART_FULL' });
      continue;
    }
    if (isNewLine) lines += 1;

    const quantity = Math.min(ordered, stock, MAX_QUANTITY);
    add.push({ variantId, quantity, reduced: quantity < ordered });
  }

  return { add, skipped };
}
