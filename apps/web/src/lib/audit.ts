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
  | 'order' | 'product' | 'user' | 'merchant' | 'settlement' | 'coupon' | 'banner'
  | 'collection'
  | 'event_log' | 'review' | 'support_post'
  /** 운영진이 내린 문의. 예전에는 'review' 로 적혀 대상 필터에서 리뷰로 묶였다 */
  | 'inquiry'
  /** 감사 로그 자체 — 내려받기. 가져간 사람도 기록에 남는다 */
  | 'audit'
  /** 오류함의 한 묶음. id 는 지문이다 */
  | 'error_group'
  /** 알림 문구 템플릿. id 는 '<종류>:<말>' */
  | 'notification_template'
  /** 알림함의 행 — 보존 기간이 지나 지운 것. id 는 'retention' */
  | 'notification'
  /** 메일 문구 템플릿. id 는 '<종류>:<말>' */
  | 'mail_template'
  /*
   * 배송비 정책. 대상이 하나뿐이라 id 는 늘 'default' 다 — 그래도 target 을
   * 두는 이유는 **전후 값**을 남기기 위해서다. 무료 기준 하나가 모든 주문의
   * 금액을 바꾸므로, 언제 무엇에서 무엇으로 바뀌었는지가 남아야 한다.
   */
  | 'shipping'
  /** 반품지. id 는 가맹점 id, 자사 상품을 받는 플랫폼 반품지면 'platform' */
  | 'return_address'
  /** 이용약관·개인정보처리방침. id 는 종류(TERMS·PRIVACY) */
  | 'policy';

/** 배치처럼 사람이 아닌 행위자 */
function isSystemActor(actor: Actor): boolean {
  return actor.id.startsWith('system:');
}

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
  const system = isSystemActor(input.actor);
  try {
    await prisma.adminAuditLog.create({
      data: {
        // 'system:' 으로 시작하는 행위자는 사용자 테이블에 없다.
        // 외래키를 만족시키려고 가짜 사용자 행을 만드는 대신, 이름만 남긴다.
        actorId: system ? null : input.actor.id,
        actorLabel: system ? input.actor.id : null,
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
