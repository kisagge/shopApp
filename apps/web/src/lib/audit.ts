import 'server-only';
import { prisma } from '@shop/db';
import type { Actor } from '@shop/core';
import { hashIp } from './analytics/server';

/**
 * 관리자 감사 로그.
 *
 * 권한 검사를 통과한 쓰기 동작 바로 옆에서 부른다. 검사와 기록이 같은 자리에
 * 있어야 새 기능을 만들 때 빠뜨리지 않는다.
 *
 * 행위자의 역할과 소속은 **그 시점 값을 스냅샷으로** 박는다. 나중에 역할이
 * 바뀌어도 "그때 무슨 권한으로 했는지"가 남아야 한다.
 */

export type AuditTargetType =
  | 'order' | 'product' | 'user' | 'merchant' | 'settlement' | 'coupon' | 'banner';

export interface AuditInput {
  readonly actor: Actor;
  /** '<대상>.<동작>' 형태. 'order.refund', 'user.assignRole' */
  readonly action: string;
  readonly targetType: AuditTargetType;
  readonly targetId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly request?: Request;
}

/** 감사 로그에 절대 담지 않는 키. 실수로 넘겨도 여기서 지운다. */
const REDACTED_KEYS = new Set([
  'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
  'secret', 'settlementAccount', 'cardNumber', 'pgPaymentKey',
]);

function redact(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k) ? '[감사 로그에서 제외]' : redact(v);
  }
  return out;
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const ip = input.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  try {
    await prisma.adminAuditLog.create({
      data: {
        actorId: input.actor.id,
        actorRole: input.actor.role,
        merchantId: input.actor.merchantId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        // exactOptionalPropertyTypes 아래에서는 undefined 를 명시적으로 넘길 수 없다.
        // 값이 있을 때만 키를 붙인다.
        ...(input.before === undefined ? {} : { before: redact(input.before) as object }),
        ...(input.after === undefined ? {} : { after: redact(input.after) as object }),
        ipHash: hashIp(ip),
      },
    });
  } catch (error) {
    // 감사 기록 실패로 본 동작을 되돌리지는 않는다. 다만 조용히 넘기지 않고 남긴다.
    console.error('[audit] 기록 실패', { action: input.action, targetId: input.targetId }, error);
  }
}

export { redact as redactForAudit };
