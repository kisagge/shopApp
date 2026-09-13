import 'server-only';
import { assertPermission, shippingPolicyFrom, type Actor, type ShippingPolicy } from '@shop/core';
import type { UpdateShippingPolicyInput } from '@shop/contract';
import { prisma } from '@shop/db';

/**
 * 배송비 정책 수정.
 *
 * **한 줄짜리 표라 upsert 로 쓴다.** 줄이 없으면 만들고 있으면 고친다 —
 * "먼저 있는지 보고 나서 쓴다" 로 하면 두 사람이 동시에 저장할 때 하나가
 * 유니크 제약에 걸린다.
 *
 * 전후 값을 함께 돌려준다. **감사 로그에 무엇이 무엇으로 바뀌었는지 남겨야
 * 하기 때문**이고, 그건 부르는 쪽(라우트)의 일이다 — 여기서 기록하면 이
 * 함수가 요청을 알아야 한다.
 */
export async function updateShippingPolicy(
  actor: Actor,
  input: UpdateShippingPolicyInput,
): Promise<{ before: ShippingPolicy | null; after: ShippingPolicy }> {
  assertPermission(actor, 'shipping:write');

  const existing = await prisma.shippingPolicy.findUnique({ where: { id: 'default' } });

  const row = await prisma.shippingPolicy.upsert({
    where: { id: 'default' },
    update: { ...input, updatedById: actor.id },
    create: { id: 'default', ...input, updatedById: actor.id },
  });

  return {
    before: existing ? shippingPolicyFrom(existing) : null,
    after: shippingPolicyFrom(row),
  };
}
