import 'server-only';
import { prisma } from '@shop/db';
import type { ActorIdentity } from '@shop/core';

/**
 * 운영 화면이 "누가 했는지" 를 적으려고 사람들을 **한 번에** 읽는다.
 *
 * 정지를 건 사람·리뷰에 답글을 단 사람은 id 만 적혀 있고 관계가 없다. 줄마다 따로 물으면 목록
 * 한 쪽에 스무 번이 나간다. 쪽에 나온 id 를 모아 한 번 묻는다.
 *
 * 지워진 계정은 결과에 없다 — 부르는 쪽은 "없는 id" 를 탈퇴한 계정으로 읽는다(core 의 actorLabel).
 */
export async function loadActors(ids: readonly (string | null)[]): Promise<ReadonlyMap<string, ActorIdentity>> {
  const wanted = [...new Set(ids.filter((id): id is string => id !== null))];
  if (wanted.length === 0) return new Map();

  const rows = await prisma.user.findMany({
    where: { id: { in: wanted } },
    select: { id: true, name: true, role: true, merchantId: true },
  });
  return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, role: r.role, merchantId: r.merchantId }]));
}
