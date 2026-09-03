import 'server-only';
import { prisma, Prisma } from '@shop/db';
import { mergeCartLines, type CartLineState } from '@shop/core';

/**
 * 로그인 사용자의 장바구니.
 *
 * 저장하는 것은 **무엇을 몇 개 담았는가뿐**이다. 이름·가격 같은 표시용
 * 값은 읽을 때 상품에서 가져온다. 담을 당시의 가격을 저장해 두면 값이
 * 바뀐 뒤에도 옛 가격이 남아 사용자를 오해하게 만든다.
 */

export interface ServerCartItem {
  readonly variantId: string;
  readonly productId: string;
  readonly productName: string;
  readonly brand: string;
  readonly optionLabel: string;
  readonly listPrice: number;
  readonly salePrice: number;
  readonly quantity: number;
  readonly selected: boolean;
}

/**
 * 장바구니를 읽는다.
 *
 * 담아 둔 사이 상품이 내려갔을 수 있다. 그런 줄도 거르지 않고 그대로
 * 돌려준다 — 견적 API 가 줄마다 사유를 붙여 알려 주는 편이 훨씬 친절하다.
 * 조용히 사라지면 사용자는 왜 없어졌는지 알 수 없다.
 */
export async function getServerCart(userId: string): Promise<ServerCartItem[]> {
  const rows = await prisma.cartItem.findMany({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: {
      variantId: true,
      quantity: true,
      selected: true,
      variant: {
        select: {
          label: true,
          priceOverride: true,
          product: {
            select: {
              id: true,
              name: true,
              listPrice: true,
              salePrice: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((row) => {
    const product = row.variant.product;
    return {
      variantId: row.variantId,
      productId: product.id,
      productName: product.name,
      brand: product.brand.name,
      optionLabel: row.variant.label,
      listPrice: product.listPrice,
      salePrice: row.variant.priceOverride ?? product.salePrice ?? product.listPrice,
      quantity: row.quantity,
      selected: row.selected,
    };
  });
}

/**
 * 장바구니를 통째로 바꾼다.
 *
 * 줄 단위 API 를 두지 않고 전체 교체로 간 이유: 장바구니는 작고, 부분
 * 갱신을 두면 클라이언트와 서버가 서로 다른 순서로 반영돼 어긋나는 경우를
 * 일일이 다뤄야 한다. 통째로 보내면 마지막에 보낸 것이 곧 결과다.
 */
export async function replaceServerCart(
  userId: string,
  lines: readonly CartLineState[],
): Promise<void> {
  // 없는 옵션 id 가 하나라도 섞이면 외래키에 걸려 저장 전체가 실패한다.
  // 있는 것만 골라 쓴다 — 한 줄 때문에 장바구니를 통째로 못 저장하면 안 된다.
  const known = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    select: { id: true },
  });
  const valid = new Set(known.map((v) => v.id));
  const usable = lines.filter((l) => valid.has(l.variantId));

  /**
   * 지우고 다시 넣지 않고 **줄 단위로 맞춘다.**
   *
   * 통째로 지웠다가 넣으면 그 사이에 다른 저장이 끼어들 때 유니크 제약에
   * 걸린다. 같은 사람이 탭을 두 개 열어 두면 실제로 일어나고, E2E 를
   * 워커 여러 개로 돌리면서 서버 로그에 드러났다 — 클라이언트가 저장
   * 실패를 조용히 삼키고 있어서 그전에는 아무도 몰랐다.
   *
   * upsert 는 이미 있는 줄을 갱신하므로 그 창이 없다. 그래도 두 요청이
   * 같은 줄을 동시에 **처음** 만들면 부딪힐 수 있어 한 번 다시 시도한다.
   * 이 함수의 뜻이 "마지막에 보낸 것이 결과" 라, 진 쪽이 다시 써도
   * 의미가 달라지지 않는다.
   */
  const write = () =>
    prisma.$transaction([
      // 새 목록에 없는 줄만 지운다
      prisma.cartItem.deleteMany({
        where: {
          userId,
          ...(usable.length > 0 ? { variantId: { notIn: usable.map((l) => l.variantId) } } : {}),
        },
      }),
      ...usable.map((l) =>
        prisma.cartItem.upsert({
          where: { userId_variantId: { userId, variantId: l.variantId } },
          update: { quantity: l.quantity, selected: l.selected },
          create: { userId, variantId: l.variantId, quantity: l.quantity, selected: l.selected },
        }),
      ),
    ]);

  try {
    await write();
  } catch (error) {
    const conflict =
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
    if (!conflict) throw error;
    await write();
  }
}


/**
 * 로그인 직후 병합.
 *
 * 비로그인으로 담아 둔 것과 서버에 있던 것을 합쳐 저장하고 결과를 돌려준다.
 * 병합 규칙(수량을 더하지 않고 큰 쪽을 쓴다)은 core 에 있다.
 */
export async function mergeServerCart(
  userId: string,
  local: readonly CartLineState[],
): Promise<ServerCartItem[]> {
  const existing = await prisma.cartItem.findMany({
    where: { userId },
    select: { variantId: true, quantity: true, selected: true },
  });

  const merged = mergeCartLines(local, existing);
  await replaceServerCart(userId, merged);
  return getServerCart(userId);
}
