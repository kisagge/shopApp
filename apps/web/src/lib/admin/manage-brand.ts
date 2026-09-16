import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  assertPermission, canCreateBrand, canEditBrand, isSlugTaken, merchantScope,
  type Actor,
} from '@shop/core';
import {
  BRAND_ERROR_MESSAGE,
  type BrandErrorCode, type CreateBrandInput, type UpdateBrandInput,
} from '@shop/contract';

/**
 * 브랜드 관리.
 *
 * **시드 말고는 브랜드를 쓰는 곳이 없었다.** 화면도 API 도 없어서, 입점 승인 때
 * 자동으로 만들어진 브랜드는 만들어진 그대로 굳었다 — 한글 이름이면 주소가
 * `brand-a1b2c3d4` 가 되는데, 그 자리의 주석은 "나중에 가맹점이 직접 고칠 수
 * 있다" 고 적어 두었지만 고칠 자리가 없었다.
 *
 * 고치는 길을 열면서 **옛 주소를 남긴다.** 주소를 바꾸는 순간 그때까지 나간 링크가
 * 죽고, 화면에는 멀쩡한 404 가 나와서 아무도 사고인 줄 모른다 — 상품과 기획전에서
 * 같은 이유로 이미 두 번 겪었다.
 */

export class BrandError extends Error {
  constructor(readonly code: BrandErrorCode, readonly status = 400) {
    super(BRAND_ERROR_MESSAGE[code]);
    this.name = 'BrandError';
  }
}

export interface BrandRow {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  /** 이 브랜드를 가진 가맹점. 자사 브랜드면 없다 */
  readonly merchantName: string | null;
  readonly productCount: number;
  /** 지금 보는 사람이 고칠 수 있는가 */
  readonly editable: boolean;
  /**
   * 자동으로 지어진 주소인가.
   *
   * 한글 이름으로 입점하면 `brand-<가맹점 id 뒤 8자>` 가 된다. 사람이 읽을 수 없는
   * 주소라 **고치라고 짚어 주는 편이 낫다** — 그러라고 만든 화면이다.
   */
  readonly slugIsGenerated: boolean;
}

const GENERATED_SLUG = /^brand-[a-z0-9]{8}$/;

export async function listBrands(actor: Actor): Promise<BrandRow[]> {
  assertPermission(actor, 'product:write');
  const scope = merchantScope(actor);

  const rows = await prisma.brand.findMany({
    // 가맹점은 자기 브랜드만 본다. 남의 간판은 볼 일이 없다.
    where: scope === undefined ? {} : scope === null ? {} : { merchantId: scope },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true, name: true, slug: true,
      merchant: { select: { name: true } },
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });

  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    merchantName: b.merchant?.name ?? null,
    productCount: b._count.products,
    editable: true,
    slugIsGenerated: GENERATED_SLUG.test(b.slug),
  }));
}

/**
 * 이 주소를 쓸 수 있는가.
 *
 * **지금 쓰는 주소만 보면 모자란다.** 남이 버리고 간 주소를 새로 집어 가면, 그
 * 주소가 한쪽에서는 새 주인을 가리키고 다른 쪽에서는 옛 주인으로 넘긴다. 판단은
 * core 가 한다(isSlugTaken) — 상품·기획전과 같은 함수다.
 */
async function slugTaken(slug: string, selfId?: string): Promise<boolean> {
  const [live, history] = await Promise.all([
    prisma.brand.findUnique({ where: { slug }, select: { id: true } }),
    prisma.brandSlug.findUnique({ where: { slug }, select: { brandId: true } }),
  ]);
  return isSlugTaken({
    liveOwnerId: live?.id ?? null,
    historyOwnerId: history?.brandId ?? null,
    ...(selfId === undefined ? {} : { selfId }),
  });
}

export async function createBrand(actor: Actor, input: CreateBrandInput): Promise<BrandRow> {
  if (!canCreateBrand(actor)) throw new BrandError('BRAND_NOT_ALLOWED', 403);

  if (await slugTaken(input.slug)) throw new BrandError('SLUG_TAKEN', 409);

  try {
    const created = await prisma.brand.create({
      // 자사 브랜드다. 가맹점 브랜드는 입점 승인이 만든다(merchant/apply).
      data: { name: input.name, slug: input.slug },
      select: { id: true, name: true, slug: true },
    });
    return {
      ...created,
      merchantName: null,
      productCount: 0,
      editable: true,
      slugIsGenerated: false,
    };
  } catch (error) {
    // 이름에도 유니크가 걸려 있다. 어느 칸이 문제인지 짚어 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BrandError('NAME_TAKEN', 409);
    }
    throw error;
  }
}

/**
 * 이름과 주소를 고친다.
 *
 * **주소를 바꾸면 옛 주소를 기록에 남긴다.** 같은 트랜잭션 안에서 한다 — 따로
 * 하면 기록만 남고 주소는 그대로이거나 그 반대가 되고, 둘 다 조용히 잘못된다.
 */
export async function updateBrand(
  actor: Actor,
  brandId: string,
  input: UpdateBrandInput,
): Promise<BrandRow> {
  assertPermission(actor, 'product:write');

  const before = await prisma.brand.findUnique({
    where: { id: brandId },
    select: {
      id: true, name: true, slug: true, merchantId: true,
      merchant: { select: { name: true } },
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
  });
  if (!before) throw new BrandError('BRAND_NOT_FOUND', 404);
  if (!canEditBrand(actor, before.merchantId)) throw new BrandError('BRAND_NOT_ALLOWED', 403);

  const renaming = input.slug !== undefined && input.slug !== before.slug;
  if (renaming && (await slugTaken(input.slug!, brandId))) {
    throw new BrandError('SLUG_TAKEN', 409);
  }

  try {
    const after = await prisma.$transaction(async (tx) => {
      if (renaming) {
        /*
         * upsert 다. 같은 주소를 두 번 거쳐 갈 수 있다 — a → b → a → b 로
         * 돌아오면 b 가 이미 기록에 있다.
         */
        await tx.brandSlug.upsert({
          where: { slug: before.slug },
          create: { slug: before.slug, brandId },
          update: { brandId },
        });
      }
      return tx.brand.update({
        where: { id: brandId },
        data: {
          ...(input.name === undefined ? {} : { name: input.name }),
          ...(input.slug === undefined ? {} : { slug: input.slug }),
        },
        select: { id: true, name: true, slug: true },
      });
    });

    return {
      ...after,
      merchantName: before.merchant?.name ?? null,
      productCount: before._count.products,
      editable: true,
      slugIsGenerated: GENERATED_SLUG.test(after.slug),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BrandError('NAME_TAKEN', 409);
    }
    throw error;
  }
}

/** 옛 주소가 가리키는 지금 주소. 없으면 null — 매대가 넘길 때 쓴다 */
export async function getBrandSlugMovedTo(slug: string): Promise<string | null> {
  const row = await prisma.brandSlug.findUnique({
    where: { slug },
    select: { brand: { select: { slug: true } } },
  });
  return row?.brand.slug ?? null;
}
