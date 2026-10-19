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

/**
 * 목록이 그리는 것만 — 날짜 둘과 그 글로 가는 id.
 *
 * **목록은 본문을 쓰지 않는다.** 그런데 조회는 판마다 `body` 와 `bodyRich` 를 함께
 * 끌어오고 있었다 — 약관 전문을, 판 수만큼, 날짜 몇 개를 그리려고. 그래서 목록에 상한이
 * 필요해 보였고 스무 개에서 잘렸다.
 */
export interface PolicyRevisionSummary {
  readonly id: string;
  readonly effectiveAt: Date;
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

/**
 * 지난 방침 목록. 최근에 바뀐 것부터, **전부**.
 *
 * **스무 개에서 조용히 잘렸다.** 손님 화면은 이 목록 위에 "언제 동의했는지에 따라 적용되는
 * 글이 다릅니다" 라고 적어 두는데, 스물한 번째 판부터는 목록에 없고 "더 보기" 도 없었다.
 * 그래서 가장 오래전에 동의한 사람 — 분쟁에서 그 글을 가장 필요로 하는 사람 — 이 자기
 * 판을 찾을 길이 없었다. 주소로 열면(`?v=`) 보이기는 하는데, 그 주소를 알 길이 목록뿐이다.
 *
 * 상한이 필요해 보였던 까닭은 조회가 판마다 **약관 전문**을 함께 끌어왔기 때문이다. 목록은
 * 날짜 둘과 id 만 그린다. 그 셋만 읽으면 이력 전체가 가벼워서 감출 이유가 없다.
 */
export async function getPolicyRevisions(kind: PolicyKind): Promise<PolicyRevisionSummary[]> {
  return await prisma.policyRevision.findMany({
    where: { kind },
    orderBy: { replacedAt: 'desc' },
    select: { id: true, effectiveAt: true, replacedAt: true },
  });
}

/**
 * **그 시각에 효력을 갖던 판.** 없으면 null — 지금 올라와 있는 것이 그때 것이다.
 *
 * core 의 `ConsentRecord` 가 이 되짚기를 전제로 설계돼 있다 — "동의한 시각으로 남긴다,
 * 무엇에 동의했는지는 그때 효력이 있던 방침이 말한다. 시각 하나면 되짚을 수 있다."
 * **그 되짚기를 하는 코드가 없었다.** 분쟁이 들어왔을 때 운영자가 보는 화면에는 동의한
 * 시각만 있어서, 이력 목록과 눈으로 맞춰 보는 수밖에 없었다.
 *
 * **기준은 `replacedAt` 이다. `effectiveAt` 으로 재면 틀린다.** 새 방침은 "며칠 뒤부터
 * 이렇게 바뀝니다" 로 미리 올릴 수 있어서, 올라와 있는 동안에도 효력은 지난 방침에 있다
 * (`policyInEffect` 가 적어 둔 그 사정이다). 지난 판이 현재 방침이던 기간의 끝이
 * `replacedAt` 이므로, 그 시각이 `at` 보다 **뒤인 것들 중 가장 이른 것**이 답이다.
 *
 * **이미 불러 둔 목록에서 고르지 않는다.** 한 가지를 묻는 데 이력 전체를 끌어와 고르면,
 * 판이 늘수록 비용이 늘고 규칙이 두 군데로 갈린다. 색인이 있으니
 * (`@@index([kind, replacedAt])`) 데이터베이스에 그 한 줄만 묻는다 — 이 화면은 목록을
 * 그리는 자리가 아니라 "그때 것 하나" 를 가리키는 자리다.
 */
export async function getPolicyInForceAt(kind: PolicyKind, at: Date): Promise<PolicyRevisionDoc | null> {
  const row = await prisma.policyRevision.findFirst({
    where: { kind, replacedAt: { gt: at } },
    orderBy: { replacedAt: 'asc' },
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
