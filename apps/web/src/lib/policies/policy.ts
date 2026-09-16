import 'server-only';
import { prisma, Prisma } from '@shop/db';
import {
  assertPermission, richTextToPlainText, type Actor, type PolicyKind, type RichTextDoc,
} from '@shop/core';
import type { PolicyInput } from '@shop/contract';
import { cachedRead, TAG, TTL } from '~/lib/cache';

/**
 * 약관·개인정보처리방침 읽기와 저장.
 *
 * **저장은 덮어쓰기가 아니라 갈아 끼우기다.** 바뀌기 전 내용을 지난 방침으로 남기고 새 내용을 올린다 — 동의 기록은 시각만
 * 갖고 있어서(User.termsAgreedAt), 지난 내용을 지우면 "그날 무엇에 동의했는가" 에 영영 답할 수 없다.
 */

export interface PolicyDoc {
  readonly kind: PolicyKind;
  readonly title: string;
  readonly body: string;
  readonly bodyRich: RichTextDoc | null;
  readonly effectiveAt: Date;
  readonly updatedAt: Date;
}

export interface PolicyRevisionDoc extends Omit<PolicyDoc, 'updatedAt'> {
  readonly id: string;
  /** 이 내용이 현재 방침이던 기간의 끝 */
  readonly replacedAt: Date;
}

const asDoc = (row: {
  kind: PolicyKind; title: string; body: string; bodyRich: unknown; effectiveAt: Date; updatedAt: Date;
}): PolicyDoc => ({
  kind: row.kind,
  title: row.title,
  body: row.body,
  bodyRich: (row.bodyRich as RichTextDoc | null) ?? null,
  effectiveAt: row.effectiveAt,
  updatedAt: row.updatedAt,
});

/*
 * 손님 화면이 읽는 자리라 캐시를 입힌다. 방침은 거의 안 바뀌고 푸터에서 어느 화면으로든 갈 수 있다 — 저장 창구가
 * 태그를 턴다(revalidatePolicies).
 */
const policyRow = cachedRead(
  (kind: PolicyKind) => prisma.policy.findUnique({ where: { kind } }),
  { key: ['policy'], tags: [TAG.policies], revalidate: TTL.support },
);

/**
 * 지금 올라와 있는 문서. 아직 한 번도 쓰지 않았으면 null.
 *
 * 캐시를 지나온 값은 **날짜가 문자열이 되어 돌아온다** — 공지에서 한 번 겪은 함정이라 경계에서 되살린다.
 */
export async function getPolicy(kind: PolicyKind): Promise<PolicyDoc | null> {
  const row = await policyRow(kind);
  return row ? asDoc({ ...row, effectiveAt: new Date(row.effectiveAt), updatedAt: new Date(row.updatedAt) }) : null;
}

/** 두 문서를 한 번에 — 운영 화면이 둘을 나란히 놓는다 */
export async function getPolicies(): Promise<PolicyDoc[]> {
  const rows = await prisma.policy.findMany({ orderBy: { kind: 'asc' } });
  return rows.map(asDoc);
}

/** 지난 방침 목록. 최근에 바뀐 것부터 */
export async function getPolicyRevisions(kind: PolicyKind, take = 20): Promise<PolicyRevisionDoc[]> {
  const rows = await prisma.policyRevision.findMany({
    where: { kind },
    orderBy: { replacedAt: 'desc' },
    take,
    select: { id: true, kind: true, title: true, body: true, bodyRich: true, effectiveAt: true, replacedAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    bodyRich: (r.bodyRich as RichTextDoc | null) ?? null,
    effectiveAt: r.effectiveAt,
    replacedAt: r.replacedAt,
  }));
}

/** 지난 방침 하나. 다른 종류의 id 를 주소에 넣어도 열리지 않는다 */
export async function getPolicyRevision(kind: PolicyKind, id: string): Promise<PolicyRevisionDoc | null> {
  const row = await prisma.policyRevision.findFirst({
    where: { id, kind },
    select: { id: true, kind: true, title: true, body: true, bodyRich: true, effectiveAt: true, replacedAt: true },
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    bodyRich: (row.bodyRich as RichTextDoc | null) ?? null,
    effectiveAt: row.effectiveAt,
    replacedAt: row.replacedAt,
  };
}

/**
 * 시행일을 그날 **한국 시각 0시**로 읽는다.
 *
 * 'YYYY-MM-DD' 를 그대로 Date 로 만들면 UTC 0시가 되어 한국에서는 전날 아침 아홉 시부터 효력이 생긴다 — 방침이
 * 예고한 날보다 하루 일찍 바뀌는 셈이다.
 */
export function effectiveAtOf(effectiveOn: string): Date {
  return new Date(`${effectiveOn}T00:00:00+09:00`);
}

/**
 * 새 내용으로 갈아 끼운다. 전후 값을 돌려준다 — 감사 로그는 부르는 쪽(라우트)의 일이다(배송비 정책과 같은 나눔).
 *
 * 처음 쓰는 문서면 남길 지난 방침이 없다. 한 트랜잭션에서 지난 것을 남기고 새 것을 올린다 — 둘로 나누면 그 사이에
 * 지난 방침만 있고 현재 방침이 없는 순간이 생긴다.
 */
export async function savePolicy(
  actor: Actor,
  kind: PolicyKind,
  input: PolicyInput,
): Promise<{ before: PolicyDoc | null; after: PolicyDoc }> {
  assertPermission(actor, 'support:write');

  const body = richTextToPlainText(input.bodyRich);
  // 나무는 계약이 이미 검사했다. Prisma 의 JSON 입력 타입으로만 옮긴다(공지 저장과 같은 자리)
  const bodyRich = input.bodyRich as unknown as Prisma.InputJsonValue;
  const effectiveAt = effectiveAtOf(input.effectiveOn);

  return await prisma.$transaction(async (tx) => {
    const current = await tx.policy.findUnique({ where: { kind } });
    if (current) {
      await tx.policyRevision.create({
        data: {
          kind,
          title: current.title,
          body: current.body,
          bodyRich: current.bodyRich ?? Prisma.JsonNull,
          effectiveAt: current.effectiveAt,
        },
      });
    }
    const after = await tx.policy.upsert({
      where: { kind },
      update: { title: input.title, body, bodyRich, effectiveAt, updatedById: actor.id },
      create: { kind, title: input.title, body, bodyRich, effectiveAt, updatedById: actor.id },
    });
    return { before: current ? asDoc(current) : null, after: asDoc(after) };
  });
}
