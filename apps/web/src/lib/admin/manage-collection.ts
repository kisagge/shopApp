import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@shop/db';
import {
  assertPermission, resequence, verifyImageBytes, imageObjectKey,
  isLive, publishStatus, isVisibleStatus, MAX_COLLECTION_ITEMS, isSlugTaken,
  type Actor, type PublishStatus, type BannerTone,
} from '@shop/core';
import {
  COLLECTION_ERROR_MESSAGE,
  type CollectionErrorCode,
  type CreateCollectionInput,
  type UpdateCollectionInput,
} from '@shop/contract';
import { getStorage } from '~/lib/storage';
import { makeBlur } from '~/lib/images/blur';

export class CollectionError extends Error {
  constructor(readonly code: CollectionErrorCode, readonly status = 404) {
    super(COLLECTION_ERROR_MESSAGE[code]);
    this.name = 'CollectionError';
  }
}

export interface CollectionRow {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly tone: BannerTone;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly status: PublishStatus;
  readonly itemCount: number;
}

const select = {
  id: true, slug: true, title: true, subtitle: true, description: true,
  imageUrl: true, imageAlt: true, tone: true, sortOrder: true,
  isActive: true, startsAt: true, endsAt: true,
  _count: { select: { items: true } },
} as const;

type Raw = {
  id: string; slug: string; title: string; subtitle: string | null;
  description: string | null; imageUrl: string | null; imageAlt: string | null;
  tone: string; sortOrder: number; isActive: boolean;
  startsAt: Date | null; endsAt: Date | null;
  _count: { items: number };
};

const toRow = (c: Raw, now: Date): CollectionRow => ({
  id: c.id, slug: c.slug, title: c.title, subtitle: c.subtitle,
  description: c.description, imageUrl: c.imageUrl, imageAlt: c.imageAlt,
  tone: c.tone as BannerTone, sortOrder: c.sortOrder, isActive: c.isActive,
  startsAt: c.startsAt, endsAt: c.endsAt,
  status: publishStatus(c, now),
  itemCount: c._count.items,
});

/** 어드민 목록 — 꺼져 있거나 끝난 것도 보여 준다. 안 보이면 고칠 수 없다. */
export async function getAdminCollections(
  actor: Actor,
  now = new Date(),
): Promise<CollectionRow[]> {
  assertPermission(actor, 'collection:read');
  const rows = await prisma.collection.findMany({ orderBy: { sortOrder: 'asc' }, select });
  return rows.map((c) => toRow(c, now));
}

export interface CollectionItemRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brandName: string;
  readonly imageUrl: string | null;
  /**
   * 지금 매대에 서 있는가.
   *
   * **담긴 채로 내려간 상품을 어드민에서는 감추지 않는다.** 손님 화면에서만
   * 빠지면 운영자는 왜 기획전이 짧아졌는지 알 수 없다.
   */
  readonly onDisplay: boolean;
}

export async function getCollectionItems(
  actor: Actor,
  collectionId: string,
): Promise<CollectionItemRow[]> {
  const byCollection = await getCollectionItemsFor(actor, [collectionId]);
  return byCollection.get(collectionId) ?? [];
}

/**
 * 여러 기획전의 담긴 상품을 **한 번에** 읽는다.
 *
 * 어드민 목록은 기획전마다 이것을 따로 불렀다 — 둘일 때는 티가 안 나지만
 * 늘면 그대로 늘고, 화면이 열릴 때마다 그만큼 왕복한다. 하나로 읽고 코드에서
 * 나눈다.
 */
export async function getCollectionItemsFor(
  actor: Actor,
  collectionIds: readonly string[],
): Promise<Map<string, CollectionItemRow[]>> {
  assertPermission(actor, 'collection:read');

  const byCollection = new Map<string, CollectionItemRow[]>();
  for (const id of collectionIds) byCollection.set(id, []);
  if (collectionIds.length === 0) return byCollection;

  const rows = await prisma.collectionItem.findMany({
    where: { collectionId: { in: [...collectionIds] } },
    // 기획전끼리도 순서를 지켜 담아야 아래에서 그대로 밀어 넣을 수 있다
    orderBy: [{ collectionId: 'asc' }, { sortOrder: 'asc' }],
    select: {
      collectionId: true,
      product: {
        select: {
          id: true, slug: true, name: true, deletedAt: true, publishedAt: true, status: true,
          brand: { select: { name: true, merchant: { select: { status: true } } } },
          images: { select: { url: true }, orderBy: { sortOrder: 'asc' }, take: 1 },
        },
      },
    },
  });

  for (const { collectionId, product: p } of rows) {
    byCollection.get(collectionId)?.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      brandName: p.brand.name,
      imageUrl: p.images[0]?.url ?? null,
      onDisplay:
        p.deletedAt === null &&
        p.publishedAt !== null &&
        isVisibleStatus(p.status) &&
        (p.brand.merchant === null || p.brand.merchant.status === 'APPROVED'),
    });
  }

  return byCollection;
}


/** 상품과 같은 규칙이다 — 기록에 남은 주소도 남의 것이면 못 쓴다. */
async function slugTaken(slug: string, selfId?: string): Promise<boolean> {
  const [live, history] = await Promise.all([
    prisma.collection.findUnique({ where: { slug }, select: { id: true } }),
    prisma.collectionSlug.findUnique({ where: { slug }, select: { collectionId: true } }),
  ]);
  return isSlugTaken({
    liveOwnerId: live?.id ?? null,
    historyOwnerId: history?.collectionId ?? null,
    selfId,
  });
}

export async function createCollection(
  actor: Actor,
  input: CreateCollectionInput,
): Promise<CollectionRow> {
  assertPermission(actor, 'collection:write');

  if (await slugTaken(input.slug)) throw new CollectionError('SLUG_TAKEN', 409);

  const count = await prisma.collection.count();
  const created = await prisma.collection.create({
    data: { ...input, sortOrder: count },
    select,
  });
  return toRow(created, new Date());
}

export async function updateCollection(
  actor: Actor,
  collectionId: string,
  input: UpdateCollectionInput,
): Promise<{ before: CollectionRow; after: CollectionRow }> {
  assertPermission(actor, 'collection:write');
  const now = new Date();

  const before = await prisma.collection.findUnique({ where: { id: collectionId }, select });
  if (!before) throw new CollectionError('COLLECTION_NOT_FOUND', 404);

  const renaming = input.slug !== undefined && input.slug !== before.slug;
  if (renaming && (await slugTaken(input.slug!, collectionId))) {
    throw new CollectionError('SLUG_TAKEN', 409);
  }

  // 보내지 않은 필드는 키 자체를 빼서 넘긴다 — "지우려는 null" 과
  // "안 보낸 undefined" 를 구분해야 한다.
  const data = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

  // 상품에서와 같은 이유로 옛 주소 기록과 수정을 함께 묶는다
  const after = await prisma.$transaction(async (tx) => {
    const updated = await tx.collection.update({ where: { id: collectionId }, data, select });

    if (renaming) {
      await tx.collectionSlug.upsert({
        where: { slug: before.slug },
        create: { slug: before.slug, collectionId },
        update: { collectionId },
      });
      await tx.collectionSlug.deleteMany({ where: { slug: input.slug! } });
    }

    return updated;
  });

  return { before: toRow(before, now), after: toRow(after, now) };
}

export async function deleteCollection(actor: Actor, collectionId: string): Promise<void> {
  assertPermission(actor, 'collection:write');

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, storageKey: true },
  });
  if (!collection) throw new CollectionError('COLLECTION_NOT_FOUND', 404);

  // 담긴 줄은 관계가 지운다(onDelete: Cascade) — 상품 자체는 건드리지 않는다
  await prisma.collection.delete({ where: { id: collection.id } });
  await resequenceCollections();

  if (collection.storageKey) {
    try {
      await getStorage().remove(collection.storageKey);
    } catch (error) {
      console.error('[collections] 저장소 객체 삭제 실패 — 고아 객체 남음', {
        key: collection.storageKey, error,
      });
    }
  }
}

/**
 * 담긴 상품을 통째로 새로 쓴다.
 *
 * 하나씩 넣고 빼면 순서를 바꿀 때마다 요청이 여러 번 나가고, 중간에 하나가
 * 실패하면 화면과 저장된 순서가 갈라진다. **보낸 순서가 곧 진열 순서다.**
 */
export async function setCollectionItems(
  actor: Actor,
  collectionId: string,
  productIds: readonly string[],
): Promise<CollectionRow> {
  assertPermission(actor, 'collection:write');

  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true },
  });
  if (!collection) throw new CollectionError('COLLECTION_NOT_FOUND', 404);

  if (productIds.length > MAX_COLLECTION_ITEMS) {
    throw new CollectionError('PRODUCT_NOT_FOUND', 400);
  }

  if (productIds.length > 0) {
    /*
     * **없는 상품이 섞이면 통째로 거절한다.** 조용히 빼고 저장하면 운영자는
     * 담았다고 생각하는데 화면에는 없는 상태가 되고, 그건 저장이 실패한 것보다
     * 알아채기 어렵다. 내려간 상품은 받는다 — 다시 올릴 예정으로 미리 담아
     * 두는 것이 정상적인 편집이다.
     */
    const found = await prisma.product.count({
      where: { id: { in: [...productIds] }, deletedAt: null },
    });
    if (found !== productIds.length) throw new CollectionError('PRODUCT_NOT_FOUND', 400);
  }

  await prisma.$transaction([
    prisma.collectionItem.deleteMany({ where: { collectionId } }),
    ...(productIds.length === 0
      ? []
      : [
          prisma.collectionItem.createMany({
            data: productIds.map((productId, sortOrder) => ({
              collectionId, productId, sortOrder,
            })),
          }),
        ]),
  ]);

  const after = await prisma.collection.findUniqueOrThrow({ where: { id: collectionId }, select });
  return toRow(after, new Date());
}

export async function reorderCollections(
  actor: Actor,
  orderedIds: readonly string[],
): Promise<CollectionRow[]> {
  assertPermission(actor, 'collection:write');

  const owned = await prisma.collection.findMany({ select: { id: true } });
  const ids = new Set(owned.map((o) => o.id));
  if (orderedIds.length !== owned.length || !orderedIds.every((id) => ids.has(id))) {
    throw new CollectionError('COLLECTION_NOT_FOUND', 404);
  }

  await prisma.$transaction(
    resequence(orderedIds).map(({ item, sortOrder }) =>
      prisma.collection.update({ where: { id: item }, data: { sortOrder } }),
    ),
  );

  return getAdminCollections(actor);
}

/** 배경 이미지 교체. 배너와 같은 검증·순서를 쓴다. */
export async function setCollectionImage(
  actor: Actor,
  collectionId: string,
  file: { bytes: Uint8Array; declaredType: string },
  alt: string,
): Promise<CollectionRow> {
  assertPermission(actor, 'collection:write');

  const before = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, storageKey: true },
  });
  if (!before) throw new CollectionError('COLLECTION_NOT_FOUND', 404);

  const contentType = verifyImageBytes(file);
  const key = imageObjectKey({
    // 상품과 같은 접두사를 쓴다 — 버킷 정책이 products/ 만 공개하기 때문이다
    productId: `collection-${collectionId}`,
    contentType,
    token: randomBytes(12).toString('base64url'),
  });

  const [{ url }, blurDataUrl] = await Promise.all([
    getStorage().put({ key, body: file.bytes, contentType }),
    makeBlur(file.bytes),
  ]);

  const after = await prisma.collection.update({
    where: { id: collectionId },
    data: { imageUrl: url, storageKey: key, blurDataUrl, imageAlt: alt.trim() || null },
    select,
  });

  // 새 이미지가 자리를 잡은 뒤에 옛것을 지운다
  if (before.storageKey && before.storageKey !== key) {
    try {
      await getStorage().remove(before.storageKey);
    } catch (error) {
      console.error('[collections] 이전 이미지 삭제 실패', { key: before.storageKey, error });
    }
  }

  return toRow(after, new Date());
}

/** 지금 노출 중인지 — 어드민 화면에서 "왜 안 보이나" 를 설명하는 데 쓴다. */
export const isCollectionLive = isLive;

async function resequenceCollections(): Promise<void> {
  const rows = await prisma.collection.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });
  const fixes = resequence(rows).filter(({ item, sortOrder }) => item.sortOrder !== sortOrder);
  if (fixes.length === 0) return;
  await prisma.$transaction(
    fixes.map(({ item, sortOrder }) =>
      prisma.collection.update({ where: { id: item.id }, data: { sortOrder } }),
    ),
  );
}
