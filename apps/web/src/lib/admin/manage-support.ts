import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  assertPermission, richTextToPlainText,
  type Actor, type SupportPostKind,
} from '@shop/core';
import type { SupportPostInput } from '@shop/contract';
import { recordAudit } from '~/lib/audit';

/**
 * 공지·FAQ 쓰기.
 *
 * **가맹점은 쓸 수 없다.** 고객센터의 글은 한 브랜드가 아니라 이 가게 전체의
 * 말이고, 배송·환불 정책은 플랫폼이 정한다 — 권한을 나눠 둔 이유가 그것이다.
 */

/** 계약의 published(불리언)를 시각으로 옮긴다 */
function publishedAtFrom(published: boolean, current: Date | null): Date | null {
  if (!published) return null;
  /*
   * 이미 내보낸 글을 고칠 때 게시일을 **다시 찍지 않는다.** 오타 하나 고쳤다고
   * 공지가 목록 맨 위로 다시 올라오면, 읽은 사람이 새 공지인 줄 안다.
   */
  return current ?? new Date();
}

function dataOf(input: SupportPostInput, current: Date | null) {
  return {
    kind: input.kind,
    title: input.title,
    /*
     * **평문은 서버가 뽑는다.** 화면이 둘 다 보내면 어느 날 서로 다른 말을
     * 하게 되고, 그때 목록은 옛 글을 보여 주면서 본문은 새 글을 보여 준다.
     * 뽑는 규칙은 core 에 하나뿐이다.
     */
    body: richTextToPlainText(input.bodyRich),
    /*
     * Prisma 의 Json 칸은 **읽기 전용 타입을 받지 않는다.** 계약이 돌려주는
     * 나무는 readonly 라 여기서 한 번 벗긴다 — 값은 그대로고 모양만 바꾼다.
     */
    bodyRich: input.bodyRich as unknown as Prisma.InputJsonValue,
    topic: input.topic ?? null,
    pinned: input.pinned,
    sortOrder: input.sortOrder,
    publishedAt: publishedAtFrom(input.published, current),
  };
}

/** 화면이 되돌려 받는 것. 생성한 글의 요지만 준다. */
export interface SavedSupportPost {
  readonly id: string;
  readonly kind: SupportPostKind;
  readonly title: string;
  readonly publishedAt: Date | null;
}

export async function createSupportPost(
  actor: Actor,
  input: SupportPostInput,
): Promise<SavedSupportPost> {
  assertPermission(actor, 'support:write');

  const post = await prisma.supportPost.create({
    data: { ...dataOf(input, null), authorId: actor.id },
    select: { id: true, kind: true, title: true, publishedAt: true },
  });

  await recordAudit({
    actor,
    action: 'support.create',
    targetType: 'support_post',
    targetId: post.id,
    after: { kind: post.kind, title: post.title, published: post.publishedAt !== null },
  });

  return post;
}

export async function updateSupportPost(
  actor: Actor,
  id: string,
  input: SupportPostInput,
): Promise<SavedSupportPost | null> {
  assertPermission(actor, 'support:write');

  const before = await prisma.supportPost.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, kind: true, title: true, publishedAt: true },
  });
  if (!before) return null;

  const post = await prisma.supportPost.update({
    where: { id },
    data: dataOf(input, before.publishedAt),
    select: { id: true, kind: true, title: true, publishedAt: true },
  });

  await recordAudit({
    actor,
    action: 'support.update',
    targetType: 'support_post',
    targetId: id,
    before: { title: before.title, published: before.publishedAt !== null },
    after: { title: post.title, published: post.publishedAt !== null },
  });

  return post;
}

/**
 * 삭제.
 *
 * **표시만 한다.** 공지는 무엇을 언제 알렸는지가 나중에 근거가 되는 글이라,
 * 지웠다고 흔적까지 없애면 그때 무슨 안내가 나갔는지 확인할 수 없다.
 */
export async function deleteSupportPost(actor: Actor, id: string): Promise<boolean> {
  assertPermission(actor, 'support:write');

  const before = await prisma.supportPost.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, kind: true, title: true },
  });
  if (!before) return false;

  await prisma.supportPost.update({ where: { id }, data: { deletedAt: new Date() } });
  await recordAudit({
    actor,
    action: 'support.delete',
    targetType: 'support_post',
    targetId: id,
    before: { kind: before.kind, title: before.title },
  });
  return true;
}
