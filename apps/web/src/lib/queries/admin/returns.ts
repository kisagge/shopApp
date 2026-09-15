import 'server-only';
import { prisma } from '@shop/db';
import {
  isMyReturnTurn, returnStageOf, RETURN_STAGE,
  type Actor, type ReturnReason, type ReturnStage, type ReturnType,
} from '@shop/core';
import { assertAdminQuery, scopeOf, PAGE_SIZE } from './scope';

/** 목록이 보는 칸 — 진행 중 전부, 한 단계, 끝남 */
export type ReturnQueueView = 'OPEN' | ReturnStage;
export const RETURN_QUEUE_VIEW = ['OPEN', ...RETURN_STAGE] as const satisfies readonly ReturnQueueView[];

export interface ReturnQueueRow {
  readonly id: string;
  readonly orderNo: string;
  readonly customerName: string;
  readonly type: ReturnType;
  readonly reason: ReturnReason;
  readonly stage: ReturnStage;
  readonly requestedAt: Date;
  readonly resolvedAt: Date | null;
  /** 신청한 뒤 지난 날 수. 진행 중인 것만 — 오래 기다린 것이 눈에 띄어야 한다 */
  readonly waitingDays: number | null;
  /** 돌려받는 줄의 상품 이름 */
  readonly productNames: readonly string[];
  /** 이 화면을 보는 사람이 다음 일을 할 차례인가 */
  readonly myTurn: boolean;
}

export interface ReturnQueuePage {
  readonly rows: readonly ReturnQueueRow[];
  readonly nextCursor: string | null;
  /** 탭에 붙는 수 — 범위 안에서, 종류 필터를 따른다 */
  readonly counts: Readonly<Record<ReturnQueueView, number>>;
}

/** 단계를 조회 조건으로. 단계 판정(core returnStageOf)과 같은 갈래여야 한다 — 검사가 맞춘다 */
export function stageWhere(view: ReturnQueueView) {
  switch (view) {
    case 'OPEN': return { status: { in: ['REQUESTED', 'APPROVED'] } };
    case 'REVIEW': return { status: 'REQUESTED' };
    case 'AWAIT_ARRIVAL': return { status: 'APPROVED', receivedAt: null };
    case 'REFUND': return { status: 'APPROVED', receivedAt: { not: null }, type: 'RETURN' };
    case 'RESHIP': return { status: 'APPROVED', receivedAt: { not: null }, type: 'EXCHANGE' };
    case 'DONE': return { status: { in: ['COMPLETED', 'REJECTED'] } };
  }
}

/**
 * 반품·교환 처리 대기열.
 *
 * **진행 중인 것은 오래 기다린 것부터** 꺼낸다 — 새 신청이 위를 막으면 사흘 된 신청이 계속 밀린다(상품 검수 대기와 같은
 * 이유). 끝난 것은 최근에 끝난 것부터.
 *
 * 가맹점은 자기 상품이 든 주문의 신청만 본다. 남의 상품이 섞인 신청도 보이되 "내 차례" 가 아니다 — 운영진 몫이라는 것을
 * 알아야 기다리지 않는다.
 */
export async function getReturnQueue(
  actor: Actor,
  query: { view?: ReturnQueueView | undefined; type?: ReturnType | undefined; cursor?: string | undefined; take?: number } = {},
  now: Date = new Date(),
): Promise<ReturnQueuePage> {
  assertAdminQuery(actor, 'order:read');
  const scope = scopeOf(actor);
  const view = query.view ?? 'OPEN';
  const take = query.take ?? PAGE_SIZE;

  const base = {
    ...(scope ? { order: { items: { some: { merchantId: scope } } } } : {}),
    ...(query.type ? { type: query.type } : {}),
  };
  const done = view === 'DONE';

  const [rows, ...counts] = await Promise.all([
    prisma.returnRequest.findMany({
      where: { ...base, ...stageWhere(view) },
      orderBy: done ? [{ resolvedAt: 'desc' as const }, { id: 'desc' as const }] : [{ requestedAt: 'asc' as const }, { id: 'asc' as const }],
      take: take + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true, type: true, reason: true, status: true, itemIds: true, receivedAt: true, requestedAt: true, resolvedAt: true,
        order: {
          select: {
            orderNo: true,
            user: { select: { name: true } },
            items: { orderBy: { id: 'asc' }, select: { id: true, productName: true, merchantId: true, status: true } },
          },
        },
      },
    }),
    ...RETURN_QUEUE_VIEW.map((v) => prisma.returnRequest.count({ where: { ...base, ...stageWhere(v) } })),
  ]);

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  return {
    rows: page.map((r) => {
      // 옛 신청(줄을 안 고른)은 반품접수인 줄 전부다 — 주문 상세와 같은 규칙
      const lines = r.order.items.filter((i) =>
        r.itemIds.length > 0 ? r.itemIds.includes(i.id) : i.status === 'RETURN_REQUESTED');
      const stage = returnStageOf(r);
      return {
        id: r.id,
        orderNo: r.order.orderNo,
        customerName: r.order.user.name,
        type: r.type as ReturnType,
        reason: r.reason as ReturnReason,
        stage,
        requestedAt: r.requestedAt,
        resolvedAt: r.resolvedAt,
        waitingDays: stage === 'DONE' ? null : Math.floor((now.getTime() - r.requestedAt.getTime()) / 86_400_000),
        productNames: (lines.length ? lines : r.order.items).map((i) => i.productName),
        myTurn: isMyReturnTurn(actor, stage, lines.map((l) => l.merchantId)),
      };
    }),
    nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    counts: Object.fromEntries(RETURN_QUEUE_VIEW.map((v, i) => [v, counts[i] ?? 0])) as Record<ReturnQueueView, number>,
  };
}

export const isReturnQueueView = (value: unknown): value is ReturnQueueView =>
  typeof value === 'string' && (RETURN_QUEUE_VIEW as readonly string[]).includes(value);

