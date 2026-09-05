import 'server-only';
import { randomBytes } from 'node:crypto';
import { prisma } from '@shop/db';
import { cachedRead, TAG, TTL } from '~/lib/cache';
import {
  assertPermission, resequence, verifyImageBytes, imageObjectKey,
  isBannerLive, bannerStatus, MAX_BANNERS,
  type Actor, type BannerStatus, type BannerTone,
} from '@shop/core';
import {
  BANNER_ERROR_MESSAGE,
  type BannerErrorCode, type CreateBannerInput, type UpdateBannerInput,
} from '@shop/contract';
import { getStorage } from '~/lib/storage';

export class BannerError extends Error {
  constructor(readonly code: BannerErrorCode, readonly status = 404) {
    super(BANNER_ERROR_MESSAGE[code]);
    this.name = 'BannerError';
  }
}

export interface BannerRow {
  readonly id: string;
  readonly eyebrow: string | null;
  readonly headline: string;
  readonly subcopy: string | null;
  readonly ctaLabel: string | null;
  readonly href: string | null;
  readonly imageUrl: string | null;
  readonly imageAlt: string | null;
  readonly imageCredit: string | null;
  readonly tone: BannerTone;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
  readonly status: BannerStatus;
}

const select = {
  id: true, eyebrow: true, headline: true, subcopy: true,
  ctaLabel: true, href: true, imageUrl: true, imageAlt: true, imageCredit: true,
  tone: true, sortOrder: true, isActive: true, startsAt: true, endsAt: true,
} as const;

type Raw = {
  id: string; eyebrow: string | null; headline: string; subcopy: string | null;
  ctaLabel: string | null; href: string | null; imageUrl: string | null;
  imageAlt: string | null; imageCredit: string | null; tone: string; sortOrder: number; isActive: boolean;
  startsAt: Date | null; endsAt: Date | null;
};

const toRow = (b: Raw, now: Date): BannerRow => ({
  ...b,
  tone: b.tone as BannerTone,
  status: bannerStatus(b, now),
});

/** 어드민 목록 — 꺼져 있거나 끝난 것도 보여 준다. 안 보이면 고칠 수 없다. */
export async function getAdminBanners(actor: Actor, now = new Date()): Promise<BannerRow[]> {
  assertPermission(actor, 'banner:read');
  const rows = await prisma.banner.findMany({ orderBy: { sortOrder: 'asc' }, select });
  return rows.map((b) => toRow(b, now));
}

/**
 * 홈에 노출할 배너.
 *
 * 게시 기간 판정을 SQL 에 넣지 않고 코드에서 한다. 조건이 세 갈래(활성 여부,
 * 시작 전, 종료 후)라 SQL 로 쓰면 읽기 어렵고, 같은 규칙을 어드민 상태 표시와
 * 두 벌로 유지하게 된다. 배너는 몇 개뿐이라 전부 읽어도 부담이 없다.
 */
/**
 * 배너 행 전체. 개수 상한이 있어(MAX_BANNERS) 통째로 읽어도 된다.
 *
 * **게시 기간 판정은 캐시 밖에 둔다.** 걸러진 결과를 캐싱하면 시작·종료
 * 시각이 캐시 수명만큼 늦어져서, 끝난 기획전이 계속 걸려 있거나 시작한
 * 배너가 안 뜬다.
 */
const bannerRows = cachedRead(
  () => prisma.banner.findMany({ orderBy: { sortOrder: 'asc' }, select }),
  { key: ['live-banners'], tags: [TAG.banners], revalidate: TTL.banners },
);

export async function getLiveBanners(now = new Date()): Promise<BannerRow[]> {
  /*
   * **캐시를 지나온 날짜를 되살린다.**
   *
   * 캐시는 값을 JSON 으로 저장하므로 Date 가 문자열이 되어 돌아온다. core 의
   * isBannerLive 는 Date 를 요구하고, 그 요구는 옳다 — 정책이 문자열도
   * 받아 주기 시작하면 어디서 무엇이 들어오는지 알 수 없게 된다. 그래서
   * 경계인 여기서 되돌린다.
   */
  const rows = (await bannerRows()).map((b) => ({
    ...b,
    startsAt: b.startsAt === null ? null : new Date(b.startsAt),
    endsAt: b.endsAt === null ? null : new Date(b.endsAt),
  }));

  return rows.filter((b) => isBannerLive(b, now)).map((b) => toRow(b, now));
}

export async function createBanner(actor: Actor, input: CreateBannerInput): Promise<BannerRow> {
  assertPermission(actor, 'banner:write');

  const count = await prisma.banner.count();
  if (count >= MAX_BANNERS) throw new BannerError('TOO_MANY_BANNERS', 409);

  const created = await prisma.banner.create({
    data: { ...input, sortOrder: count },
    select,
  });
  return toRow(created, new Date());
}

export async function updateBanner(
  actor: Actor,
  bannerId: string,
  input: UpdateBannerInput,
): Promise<{ before: BannerRow; after: BannerRow }> {
  assertPermission(actor, 'banner:write');
  const now = new Date();

  const before = await prisma.banner.findUnique({ where: { id: bannerId }, select });
  if (!before) throw new BannerError('BANNER_NOT_FOUND', 404);

  // 보내지 않은 필드는 키 자체를 빼서 넘긴다. exactOptionalPropertyTypes 아래에서
  // undefined 를 그대로 실어 보내면 Prisma 입력 타입과 맞지 않고,
  // 무엇보다 "지우려는 null" 과 "안 보낸 undefined" 를 구분해야 한다.
  const data = Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  );

  const after = await prisma.banner.update({
    where: { id: bannerId },
    data,
    select,
  });

  return { before: toRow(before, now), after: toRow(after, now) };
}

export async function deleteBanner(actor: Actor, bannerId: string): Promise<void> {
  assertPermission(actor, 'banner:write');

  const banner = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true, storageKey: true },
  });
  if (!banner) throw new BannerError('BANNER_NOT_FOUND', 404);

  await prisma.banner.delete({ where: { id: banner.id } });
  await resequenceBanners();

  if (banner.storageKey) {
    // 상품 이미지와 같은 판단 — 화면에서 사라지는 것이 우선이다
    try {
      await getStorage().remove(banner.storageKey);
    } catch (error) {
      console.error('[banners] 저장소 객체 삭제 실패 — 고아 객체 남음', {
        key: banner.storageKey, error,
      });
    }
  }
}

export async function reorderBanners(
  actor: Actor,
  orderedIds: readonly string[],
): Promise<BannerRow[]> {
  assertPermission(actor, 'banner:write');

  const owned = await prisma.banner.findMany({ select: { id: true } });
  const ids = new Set(owned.map((o) => o.id));
  if (orderedIds.length !== owned.length || !orderedIds.every((id) => ids.has(id))) {
    throw new BannerError('BANNER_NOT_FOUND', 404);
  }

  await prisma.$transaction(
    resequence(orderedIds).map(({ item, sortOrder }) =>
      prisma.banner.update({ where: { id: item }, data: { sortOrder } }),
    ),
  );

  return getAdminBanners(actor);
}

/** 배경 이미지 교체. 상품 이미지와 같은 검증·순서를 쓴다. */
export async function setBannerImage(
  actor: Actor,
  bannerId: string,
  file: { bytes: Uint8Array; declaredType: string },
  alt: string,
): Promise<BannerRow> {
  assertPermission(actor, 'banner:write');

  const before = await prisma.banner.findUnique({
    where: { id: bannerId },
    select: { id: true, storageKey: true },
  });
  if (!before) throw new BannerError('BANNER_NOT_FOUND', 404);

  const contentType = verifyImageBytes(file);
  const key = imageObjectKey({
    // 상품과 같은 접두사를 쓴다 — 버킷 정책이 products/ 만 공개하기 때문이다
    productId: `banner-${bannerId}`,
    contentType,
    token: randomBytes(12).toString('base64url'),
  });

  const { url } = await getStorage().put({ key, body: file.bytes, contentType });

  const after = await prisma.banner.update({
    where: { id: bannerId },
    data: { imageUrl: url, storageKey: key, imageAlt: alt.trim() || null },
    select,
  });

  // 새 이미지가 자리를 잡은 뒤에 옛것을 지운다
  if (before.storageKey && before.storageKey !== key) {
    try {
      await getStorage().remove(before.storageKey);
    } catch (error) {
      console.error('[banners] 이전 이미지 삭제 실패', { key: before.storageKey, error });
    }
  }

  return toRow(after, new Date());
}

async function resequenceBanners(): Promise<void> {
  const rows = await prisma.banner.findMany({
    orderBy: { sortOrder: 'asc' },
    select: { id: true, sortOrder: true },
  });
  const fixes = resequence(rows).filter(({ item, sortOrder }) => item.sortOrder !== sortOrder);
  if (fixes.length === 0) return;
  await prisma.$transaction(
    fixes.map(({ item, sortOrder }) =>
      prisma.banner.update({ where: { id: item.id }, data: { sortOrder } }),
    ),
  );
}
