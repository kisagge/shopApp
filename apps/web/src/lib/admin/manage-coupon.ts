import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  assertPermission, couponStatus, canEditDiscount, normalizeCouponCode,
  validateCouponDefinition, isIssuable,
  type Actor, type CouponStatus,
} from '@shop/core';
import type { CreateCouponInput, UpdateCouponInput } from '@shop/contract';

/**
 * 쿠폰 발행과 발급.
 *
 * 쓰는 쪽(할인 계산)은 core 의 cart.ts 와 queries/cart.ts 에 이미 있다.
 * 여기는 만들고 나눠 주는 쪽이다.
 */

export class CouponError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 400,
    readonly fields: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'CouponError';
  }
}

export interface CouponRow {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly kind: string;
  readonly value: number;
  readonly percent: number;
  readonly maxDiscount: number | null;
  readonly minimumOrder: number;
  readonly issueLimit: number | null;
  readonly issuedCount: number;
  readonly usedCount: number;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly isActive: boolean;
  readonly status: CouponStatus;
  readonly editable: boolean;
  /** 대상이 정해져 있으면 그 수. 0이면 장바구니 전체. */
  readonly targetCount: number;
}

export async function listCoupons(actor: Actor, now = new Date()): Promise<CouponRow[]> {
  assertPermission(actor, 'coupon:read');

  const rows = await prisma.coupon.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, code: true, name: true, kind: true, value: true, percent: true,
      maxDiscount: true, minimumOrder: true, issueLimit: true, issuedCount: true,
      startsAt: true, endsAt: true, isActive: true,
      // 발급된 것 중 실제로 쓴 수. 발급 수만으로는 효과를 알 수 없다.
      _count: { select: { issued: { where: { usedAt: { not: null } } }, targets: true } },
    },
  });

  return rows.map((r) => ({
    ...r,
    usedCount: r._count.issued,
    targetCount: r._count.targets,
    status: couponStatus(r, now),
    editable: canEditDiscount(r.issuedCount),
  }));
}

function toDefinition(input: CreateCouponInput) {
  return {
    kind: input.kind,
    value: input.kind === 'AMOUNT' ? input.value : 0,
    percent: input.kind === 'PERCENT' ? input.percent : 0,
    maxDiscount: input.kind === 'PERCENT' ? (input.maxDiscount ?? null) : null,
    minimumOrder: input.minimumOrder,
    issueLimit: input.issueLimit ?? null,
    startsAt: new Date(input.startsAt),
    endsAt: new Date(input.endsAt),
  };
}

export async function createCoupon(actor: Actor, input: CreateCouponInput): Promise<CouponRow> {
  assertPermission(actor, 'coupon:write');

  const definition = toDefinition(input);
  const errors = validateCouponDefinition(definition);
  if (Object.keys(errors).length > 0) {
    throw new CouponError('INVALID_COUPON', '쿠폰 내용을 확인해 주세요.', 400, errors);
  }

  const code = normalizeCouponCode(input.code);

  try {
    const created = await prisma.coupon.create({
      data: {
        ...definition,
        code,
        name: input.name.trim(),
        // 대상이 없으면 행을 안 만든다 = 장바구니 전체
        ...(input.targets.length > 0
          ? { targets: { createMany: { data: [...input.targets] } } }
          : {}),
      },
      select: {
        id: true, code: true, name: true, kind: true, value: true, percent: true,
        maxDiscount: true, minimumOrder: true, issueLimit: true, issuedCount: true,
        startsAt: true, endsAt: true, isActive: true,
      },
    });
    return {
      ...created,
      usedCount: 0,
      targetCount: input.targets.length,
      status: couponStatus(created, new Date()),
      editable: true,
    };
  } catch (error) {
    // 같은 코드가 이미 있다. 어느 칸이 문제인지 짚어 준다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new CouponError('DUPLICATE_CODE', '이미 쓰고 있는 코드입니다.', 409, {
        code: '이미 쓰고 있는 코드입니다',
      });
    }
    throw error;
  }
}

/**
 * 쿠폰을 고친다.
 *
 * **한 장이라도 발급됐으면 할인 내용은 못 고친다.** 받은 사람은 그때 조건으로
 * 쓸 수 있다고 믿고 있다. 이름·종료일·중지 여부만 열어 둔다.
 *
 * 종료일은 **늘리는 것만** 허용한다. 줄이면 아직 안 쓴 사람의 쿠폰이 그
 * 순간 사라진다 — 그건 회수지 수정이 아니다. 회수하려면 중지를 쓴다.
 */
export async function updateCoupon(
  actor: Actor,
  id: string,
  input: UpdateCouponInput,
): Promise<CouponRow> {
  assertPermission(actor, 'coupon:write');

  const existing = await prisma.coupon.findUnique({
    where: { id },
    select: { id: true, issuedCount: true, endsAt: true },
  });
  if (!existing) throw new CouponError('NOT_FOUND', '쿠폰을 찾을 수 없습니다.', 404);

  if (input.endsAt !== undefined) {
    const next = new Date(input.endsAt);
    if (existing.issuedCount > 0 && next.getTime() < existing.endsAt.getTime()) {
      throw new CouponError('CANNOT_SHORTEN', '이미 발급된 쿠폰의 기간은 줄일 수 없습니다.', 409, {
        endsAt: '기간을 줄이려면 쿠폰을 중지해 주세요',
      });
    }
  }

  const updated = await prisma.coupon.update({
    where: { id },
    data: {
      ...(input.name === undefined ? {} : { name: input.name.trim() }),
      ...(input.endsAt === undefined ? {} : { endsAt: new Date(input.endsAt) }),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
    },
    select: {
      id: true, code: true, name: true, kind: true, value: true, percent: true,
      maxDiscount: true, minimumOrder: true, issueLimit: true, issuedCount: true,
      startsAt: true, endsAt: true, isActive: true,
      _count: { select: { issued: { where: { usedAt: { not: null } } }, targets: true } },
    },
  });

  return {
    ...updated,
    usedCount: updated._count.issued,
    targetCount: updated._count.targets,
    status: couponStatus(updated, new Date()),
    editable: canEditDiscount(updated.issuedCount),
  };
}

export interface IssueResult {
  readonly code: string;
  readonly name: string;
  readonly expiresAt: Date;
}

/**
 * 쿠폰 한 장을 사용자에게 발급한다.
 *
 * **발급 수량은 두 사람이 동시에 마지막 한 장을 집는 경우가 있다.**
 * 읽고 나서 세고 나서 쓰면 둘 다 통과해 한도를 넘긴다. 그래서 조건과
 * 증가를 한 문장으로 붙였다 — 조건을 만족하는 행만 올라간다.
 *
 * Prisma 의 where 는 같은 행의 다른 컬럼을 비교하지 못해서
 * ("issuedCount" < "issueLimit") 여기만 SQL 로 쓴다.
 */
export async function issueCouponToUser(
  couponId: string,
  userId: string,
  now = new Date(),
): Promise<IssueResult> {
  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: {
      id: true, code: true, name: true, isActive: true,
      startsAt: true, endsAt: true, issueLimit: true, issuedCount: true,
    },
  });
  if (!coupon) throw new CouponError('NOT_FOUND', '쿠폰을 찾을 수 없습니다.', 404);

  /**
   * 이미 받았는지를 **먼저** 본다.
   *
   * 순서가 중요하다. 발급 가능 여부를 먼저 보면, 자기가 마지막 한 장을
   * 가진 사람에게 "소진됐습니다" 라고 답하게 된다 — 놓친 줄 알고 만다.
   * 이미 가진 사람에게는 그렇다고 말해 주는 것이 맞다.
   */
  const already = await prisma.userCoupon.findUnique({
    where: { userId_couponId: { userId, couponId } },
    select: { id: true },
  });
  if (already) throw new CouponError('ALREADY_ISSUED', '이미 받은 쿠폰입니다.', 409);

  if (!isIssuable(coupon, now)) {
    const status = couponStatus(coupon, now);
    const message =
      status === 'EXPIRED' ? '기간이 지난 쿠폰입니다.'
      : status === 'SCHEDULED' ? '아직 받을 수 없는 쿠폰입니다.'
      : status === 'EXHAUSTED' ? '준비된 수량이 모두 소진됐습니다.'
      : '지금은 받을 수 없는 쿠폰입니다.';
    throw new CouponError(status, message, 409);
  }

  return prisma.$transaction(async (tx) => {
    // 위에서 본 뒤 여기 오기까지 사이에 받았을 수도 있다. 유니크 제약이
    // 최종 방어선이고, 이 확인은 그 오류를 우리 말로 바꿔 주는 것이다.
    const raced = await tx.userCoupon.findUnique({
      where: { userId_couponId: { userId, couponId } },
      select: { id: true },
    });
    if (raced) throw new CouponError('ALREADY_ISSUED', '이미 받은 쿠폰입니다.', 409);

    const claimed = await tx.$executeRaw`
      UPDATE coupons
         SET "issuedCount" = "issuedCount" + 1
       WHERE id = ${couponId}
         AND ("issueLimit" IS NULL OR "issuedCount" < "issueLimit")
    `;
    // 0건이면 그 사이 마지막 한 장이 나갔다는 뜻이다.
    if (claimed === 0) {
      throw new CouponError('EXHAUSTED', '준비된 수량이 모두 소진됐습니다.', 409);
    }

    await tx.userCoupon.create({
      data: { userId, couponId, expiresAt: coupon.endsAt },
    });

    return { code: coupon.code, name: coupon.name, expiresAt: coupon.endsAt };
  });
}

/**
 * 코드로 직접 받는다.
 *
 * 코드를 아는 사람만 받을 수 있는 경로다. 어드민이 지정해 뿌리는 것과
 * 다르므로 발급 가능 여부를 똑같이 확인한다.
 */
export async function claimCouponByCode(
  code: string,
  userId: string,
  now = new Date(),
): Promise<IssueResult> {
  const normalized = normalizeCouponCode(code);
  const coupon = await prisma.coupon.findUnique({
    where: { code: normalized },
    select: { id: true },
  });
  // 없는 코드와 못 받는 코드를 구분하지 않는다. 구분해 주면 코드를
  // 무작위로 넣어 보며 존재 여부를 알아낼 수 있다.
  if (!coupon) throw new CouponError('NOT_FOUND', '사용할 수 없는 코드입니다.', 404);

  return issueCouponToUser(coupon.id, userId, now);
}

/** 어드민이 여러 사용자에게 한 번에 지급한다 */
export async function issueCouponToUsers(
  actor: Actor,
  couponId: string,
  userIds: readonly string[],
  now = new Date(),
): Promise<{ issued: number; skipped: number }> {
  assertPermission(actor, 'coupon:write');

  let issued = 0;
  let skipped = 0;
  for (const userId of userIds) {
    try {
      await issueCouponToUser(couponId, userId, now);
      issued += 1;
    } catch (error) {
      // 이미 받은 사람은 건너뛴다. 한 명 때문에 전체를 멈출 이유가 없다.
      if (error instanceof CouponError && error.code === 'ALREADY_ISSUED') {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }
  return { issued, skipped };
}
