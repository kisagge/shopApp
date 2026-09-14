import 'server-only';
import { cache } from 'react';
import { prisma } from '@shop/db';
import {
  assertPermission, checkTemplate, isNotificationKind,
  type Actor, type NotificationKind, type TemplateProblem,
} from '@shop/core';
import type { UpdateNotificationTemplateInput } from '@shop/contract';
import type { Locale } from '@shop/i18n';
import { describeTemplateProblem } from './template-problems';

/** 한 말의 템플릿들. 운영이 고친 종류만 들어 있다 — 없는 종류는 사전의 기본 문구 */
export type NotificationTemplates = ReadonlyMap<NotificationKind, string>;

/**
 * 지금 말의 알림 문구 템플릿.
 *
 * **요청 안에서 한 번만 읽는다** — 알림 목록은 줄마다 문구를 만들므로 줄마다 물으면 안 된다.
 *
 * **못 읽으면 빈 표로 간다.** 문구 표가 흔들렸다고 알림함이 안 열리면 안 된다 — 기본 문구로 읽히면 된다. 배송비 정책을
 * 못 읽으면 바닥값으로 가는 것과 같은 판단이다.
 */
export const getNotificationTemplates = cache(async (locale: Locale): Promise<NotificationTemplates> => {
  try {
    const rows = await prisma.notificationTemplate.findMany({ where: { locale }, select: { kind: true, body: true } });
    return new Map(rows.filter((r) => isNotificationKind(r.kind)).map((r) => [r.kind, r.body]));
  } catch (error) {
    console.error('[notification] 문구 템플릿을 못 읽어 기본 문구로 간다', error);
    return new Map();
  }
});

/** 운영 화면이 쓰는 전체 표 — 종류·말마다 고친 문구와 고친 시각 */
export interface NotificationTemplateRow {
  readonly kind: NotificationKind;
  readonly locale: string;
  readonly body: string;
  readonly updatedAt: Date;
}

export async function getAllNotificationTemplates(actor: Actor): Promise<NotificationTemplateRow[]> {
  assertPermission(actor, 'notification:write');
  return prisma.notificationTemplate.findMany({ select: { kind: true, locale: true, body: true, updatedAt: true } });
}

export class TemplateError extends Error {
  constructor(readonly problems: readonly TemplateProblem[]) {
    super(problems.map(describeTemplateProblem).join(' '));
    this.name = 'TemplateError';
  }
}

/**
 * 템플릿 저장 · 기본 문구로 되돌리기.
 *
 * 전후 문구를 돌려준다 — 감사 로그에 남기는 것은 라우트의 일이다(manage-shipping 과 같다). 이미 온 알림도 새 문구로
 * 읽히므로, 무엇에서 무엇으로 바뀌었는지가 남아야 "어제 받은 알림 말이 달라졌다" 는 문의에 답할 수 있다.
 *
 * 앞뒤 공백은 지운다. 그대로 두면 알림 목록의 첫 글자 줄이 흔들린다.
 */
export async function saveNotificationTemplate(
  actor: Actor,
  input: UpdateNotificationTemplateInput,
): Promise<{ before: string | null; after: string | null }> {
  assertPermission(actor, 'notification:write');
  const where = { kind_locale: { kind: input.kind, locale: input.locale } };
  const existing = await prisma.notificationTemplate.findUnique({ where, select: { body: true } });

  if (input.body === null) {
    if (existing) await prisma.notificationTemplate.delete({ where });
    return { before: existing?.body ?? null, after: null };
  }

  const body = input.body.trim();
  const problems = checkTemplate(input.kind, body);
  if (problems.length > 0) throw new TemplateError(problems);

  await prisma.notificationTemplate.upsert({
    where,
    update: { body, updatedBy: actor.id },
    create: { kind: input.kind, locale: input.locale, body, updatedBy: actor.id },
  });
  return { before: existing?.body ?? null, after: body };
}
