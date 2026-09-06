import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  assertPermission, couponStatus, canEditDiscount, normalizeCouponCode,
  validateCouponDefinition, isIssuable,
  type Actor, type CouponStatus,
} from '@shop/core';
import type { CreateCouponInput, UpdateCouponInput } from '@shop/contract';
import { recordNotifications } from '~/lib/notifications/record';

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

/**
 * 운영진이 고른 회원들에게 한 번에 지급한다.
 *
 * **한 사람씩 돌지 않는다.** 사람마다 조회 두 번과 트랜잭션 하나면, 계약이
 * 허용하는 500명에서 질의가 2천 번이다 — 서버리스에서 시간 안에 끝나지
 * 않는다. 이미 받은 사람을 한 번에 걸러 내고, 한도는 조건부 UPDATE 로 한 번에
 * 잡고, 나머지를 한 번에 넣는다.
 *
 * **모자라면 아무에게도 주지 않는다.** 고른 서른 명 중 열 명만 받는 것은
 * 운영자에게 "누가 받았나" 라는 질문을 남긴다. 몇 장이 남았는지 알려 주고
 * 다시 고르게 하는 편이 낫다 — 스스로 받아 가는 경로(코드 입력)와 판단이
 * 다른 이유는, 그쪽은 고르는 사람이 자기 하나뿐이기 때문이다.
 *
 * 이미 받은 사람은 **건너뛴다.** 한 명 때문에 전체를 멈출 이유가 없고,
 * 운영자가 목록에서 그 사람을 골라낼 방법도 없다.
 */
export interface IssueSummary {
  /** 이번에 새로 받은 사람 수 */
  readonly issued: number;
  /** 이미 갖고 있어 건너뛴 사람 수 */
  readonly skipped: number;
}

export async function issueCouponToUsers(
  actor: Actor,
  couponId: string,
  userIds: readonly string[],
  now = new Date(),
): Promise<IssueSummary> {
  assertPermission(actor, 'coupon:write');

  const coupon = await prisma.coupon.findUnique({
    where: { id: couponId },
    select: {
      id: true, code: true, name: true, isActive: true,
      startsAt: true, endsAt: true, issueLimit: true, issuedCount: true,
    },
  });
  if (!coupon) throw new CouponError('NOT_FOUND', '쿠폰을 찾을 수 없습니다.', 404);

  /*
   * 쿠폰 자체가 줄 수 없는 상태면 아무것도 하기 전에 멈춘다. 한 사람씩 돌 때는
   * 첫 사람에서 걸렸지만, 한 번에 처리하면 여기서 봐야 한다.
   */
  if (!isIssuable(coupon, now)) {
    const status = couponStatus(coupon, now);
    throw new CouponError(status, '지금은 지급할 수 없는 쿠폰입니다.', 409);
  }

  // 같은 사람을 두 번 고를 수 있다. 세기 전에 접는다.
  const unique = [...new Set(userIds)];

  const summary = await prisma.$transaction(async (tx) => {
    const already = await tx.userCoupon.findMany({
      where: { couponId, userId: { in: unique } },
      select: { userId: true },
    });
    const has = new Set(already.map((u) => u.userId));
    const targets = unique.filter((id) => !has.has(id));
    if (targets.length === 0) return { issued: 0, skipped: has.size, granted: [] as string[] };

    /*
     * 한도를 원자적으로 잡는다. **한 번에 다 들어가지 않으면 0건**이라,
     * 그 사이 다른 요청이 마지막 장을 가져갔어도 초과 발급이 없다.
     */
    const claimed = await tx.$executeRaw`
      UPDATE coupons
         SET "issuedCount" = "issuedCount" + ${targets.length}
       WHERE id = ${couponId}
         AND ("issueLimit" IS NULL OR "issuedCount" + ${targets.length} <= "issueLimit")
    `;
    if (claimed === 0) {
      const left = coupon.issueLimit === null ? 0 : coupon.issueLimit - coupon.issuedCount;
      throw new CouponError(
        'EXHAUSTED',
        `남은 수량이 ${left}장이라 ${targets.length}명에게 지급할 수 없습니다.`,
        409,
      );
    }

    const { count } = await tx.userCoupon.createMany({
      data: targets.map((userId) => ({ userId, couponId, expiresAt: coupon.endsAt })),
      // 여기까지 오는 사이에 스스로 받아 간 사람이 있을 수 있다
      skipDuplicates: true,
    });

    /*
     * 잡아 둔 수와 실제로 들어간 수가 다르면 그만큼 되돌린다. 안 그러면
     * 발급 수가 실제보다 많아져서, 남은 장수가 있는데 소진으로 보인다.
     */
    if (count < targets.length) {
      await tx.coupon.update({
        where: { id: couponId },
        data: { issuedCount: { decrement: targets.length - count } },
      });
    }

    return { issued: count, skipped: has.size, granted: targets };
  });

  /*
   * **받은 줄 모르면 쿠폰은 없는 것과 같다.** 트랜잭션 밖에서 남기고 실패해도
   * 삼킨다 — 알림이 안 갔다고 지급을 되돌릴 일이 아니다.
   */
  if (summary.issued > 0) {
    await recordNotifications(
      summary.granted.map((userId) => ({
        userId,
        kind: 'COUPON_ISSUED' as const,
        params: { couponName: coupon.name },
        href: '/mypage/coupons',
      })),
    );
  }

  return { issued: summary.issued, skipped: summary.skipped };
}
