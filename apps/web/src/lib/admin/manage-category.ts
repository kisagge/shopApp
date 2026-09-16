import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  canDeleteCategory, canManageCategory, categoryPlacementProblem, isSlugTaken, resequence,
  type Actor,
} from '@shop/core';
import {
  CATEGORY_ERROR_MESSAGE,
  type CategoryErrorCode, type CreateCategoryInput, type UpdateCategoryInput,
} from '@shop/contract';

/**
 * 카테고리 관리.
 *
 * **바꿀 창구가 없었다.** 매대의 카테고리 조회에 "창구가 없어서 거의 바뀌지 않는다"
 * 고 적혀 있다 — 캐시를 길게 잡아도 되는 이유로 적은 말이지만, 관리 화면이 없다는
 * 사실을 돌려 말한 것이기도 하다. 시즌마다 갈래를 더하려면 DB 콘솔을 열어야 했고,
 * 머리 메뉴의 순서도 시드만 썼다.
 */

export class CategoryError extends Error {
  constructor(readonly code: CategoryErrorCode, readonly status = 400) {
    super(CATEGORY_ERROR_MESSAGE[code]);
    this.name = 'CategoryError';
  }
}

export interface CategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly productCount: number;
  /** 지울 수 있는가 — 상품도 자식도 없을 때만 */
  readonly deletable: boolean;
  readonly children: readonly CategoryNode[];
}

/** 상품 수는 **자기 것만** 센다 — 상위의 합계는 화면이 더한다 */
const nodeSelect = {
  id: true, name: true, slug: true, sortOrder: true,
  _count: { select: { products: { where: { deletedAt: null } }, children: true } },
} as const;

export async function getCategoryTree(actor: Actor): Promise<CategoryNode[]> {
  if (!canManageCategory(actor)) throw new CategoryError('CATEGORY_NOT_FOUND', 403);

  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { ...nodeSelect, parentId: true },
  });

  const toNode = (r: (typeof rows)[number]): CategoryNode => ({
    id: r.id,
    name: r.name,
    slug: r.slug,
    productCount: r._count.products,
    deletable: canDeleteCategory({ productCount: r._count.products, childCount: r._count.children }),
    children: rows.filter((c) => c.parentId === r.id).map(toNode),
  });

  return rows.filter((r) => r.parentId === null).map(toNode);
}

/** 주소가 비었는가. 판단은 core 가 한다 — 브랜드·상품·기획전과 같은 함수다 */
async function slugTaken(slug: string, selfId?: string): Promise<boolean> {
  const [live, history] = await Promise.all([
    prisma.category.findUnique({ where: { slug }, select: { id: true } }),
    prisma.categorySlug.findUnique({ where: { slug }, select: { categoryId: true } }),
  ]);
  return isSlugTaken({
    liveOwnerId: live?.id ?? null,
    historyOwnerId: history?.categoryId ?? null,
    ...(selfId === undefined ? {} : { selfId }),
  });
}

/** 둘 수 있는 자리인지 본다. 판단은 core, 값을 읽어 오는 것만 여기서 한다 */
async function assertPlacement(parentId: string | null): Promise<void> {
  if (parentId === null) return;

  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, parentId: true, _count: { select: { products: { where: { deletedAt: null } } } } },
  });
  if (!parent) throw new CategoryError('CATEGORY_NOT_FOUND', 404);

  const problem = categoryPlacementProblem({
    parent: { id: parent.id, parentId: parent.parentId, productCount: parent._count.products },
  });
  if (problem) throw new CategoryError(problem.kind, 409);
}

export async function createCategory(actor: Actor, input: CreateCategoryInput): Promise<CategoryNode[]> {
  if (!canManageCategory(actor)) throw new CategoryError('CATEGORY_NOT_FOUND', 403);

  if (await slugTaken(input.slug)) throw new CategoryError('SLUG_TAKEN', 409);
  await assertPlacement(input.parentId);

  /*
   * 맨 뒤에 놓는다. 가운데로 밀어 넣으면 이미 정해 둔 메뉴 순서가 흔들린다 —
   * 자리를 옮기는 것은 순서 바꾸기가 할 일이다.
   */
  const last = await prisma.category.findFirst({
    where: { parentId: input.parentId },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  try {
    await prisma.category.create({
      data: {
        name: input.name,
        slug: input.slug,
        parentId: input.parentId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new CategoryError('SLUG_TAKEN', 409);
    }
    throw error;
  }

  return getCategoryTree(actor);
}

/**
 * 이름과 주소를 고친다.
 *
 * **주소를 바꾸면 옛 주소를 기록에 남긴다.** 브랜드와 같은 규칙이고, 같은
 * 트랜잭션에서 한다 — 따로 하면 한쪽만 되고 둘 다 조용히 잘못된다.
 */
export async function updateCategory(
  actor: Actor,
  categoryId: string,
  input: UpdateCategoryInput,
): Promise<CategoryNode[]> {
  if (!canManageCategory(actor)) throw new CategoryError('CATEGORY_NOT_FOUND', 403);

  const before = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { id: true, slug: true },
  });
  if (!before) throw new CategoryError('CATEGORY_NOT_FOUND', 404);

  const renaming = input.slug !== undefined && input.slug !== before.slug;
  if (renaming && (await slugTaken(input.slug!, categoryId))) {
    throw new CategoryError('SLUG_TAKEN', 409);
  }

  await prisma.$transaction(async (tx) => {
    if (renaming) {
      // 같은 주소를 두 번 거쳐 갈 수 있다 — a → b → a → b 면 b 가 이미 기록에 있다
      await tx.categorySlug.upsert({
        where: { slug: before.slug },
        create: { slug: before.slug, categoryId },
        update: { categoryId },
      });
    }
    await tx.category.update({
      where: { id: categoryId },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.slug === undefined ? {} : { slug: input.slug }),
      },
    });
  });

  return getCategoryTree(actor);
}

/**
 * 같은 부모 안에서 순서를 바꾼다.
 *
 * **그 부모의 자식 전부를 받는다.** 일부만 받으면 나머지의 자리가 어디인지 알 수
 * 없어서, 다시 매길 때 조용히 앞으로 끌려 나온다.
 */
export async function reorderCategories(
  actor: Actor,
  parentId: string | null,
  orderedIds: readonly string[],
): Promise<CategoryNode[]> {
  if (!canManageCategory(actor)) throw new CategoryError('CATEGORY_NOT_FOUND', 403);

  const siblings = await prisma.category.findMany({ where: { parentId }, select: { id: true } });
  const ids = new Set(siblings.map((s) => s.id));
  if (orderedIds.length !== siblings.length || !orderedIds.every((id) => ids.has(id))) {
    throw new CategoryError('CATEGORY_NOT_FOUND', 404);
  }

  await prisma.$transaction(
    resequence(orderedIds).map(({ item, sortOrder }) =>
      prisma.category.update({ where: { id: item }, data: { sortOrder } }),
    ),
  );

  return getCategoryTree(actor);
}

/**
 * 지운다 — **비어 있을 때만.**
 *
 * 상품이 붙어 있으면 그 상품들이 갈 곳을 잃고, 자식이 있으면 그 갈래가 통째로
 * 매대에서 사라진다. 잘못 만든 것을 되돌리는 용도다.
 */
export async function deleteCategory(actor: Actor, categoryId: string): Promise<CategoryNode[]> {
  if (!canManageCategory(actor)) throw new CategoryError('CATEGORY_NOT_FOUND', 403);

  const target = await prisma.category.findUnique({
    where: { id: categoryId },
    select: { _count: { select: { products: { where: { deletedAt: null } }, children: true } } },
  });
  if (!target) throw new CategoryError('CATEGORY_NOT_FOUND', 404);

  if (!canDeleteCategory({
    productCount: target._count.products,
    childCount: target._count.children,
  })) {
    throw new CategoryError('CATEGORY_NOT_EMPTY', 409);
  }

  // 옛 주소 기록은 함께 사라진다(onDelete: Cascade) — 가리킬 곳이 없어졌으니 맞다
  await prisma.category.delete({ where: { id: categoryId } });
  return getCategoryTree(actor);
}

/** 옛 주소가 가리키는 지금 주소. 없으면 null — 매대가 넘길 때 쓴다 */
export async function getCategorySlugMovedTo(slug: string): Promise<string | null> {
  const row = await prisma.categorySlug.findUnique({
    where: { slug },
    select: { category: { select: { slug: true } } },
  });
  return row?.category.slug ?? null;
}
