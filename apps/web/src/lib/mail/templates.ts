import 'server-only';
import { prisma } from '@shop/db';
import {
  assertPermission, checkTemplateText, isMailTemplateKind, renderTemplate,
  MAIL_TEMPLATE_FIELD, MAIL_TEMPLATE_MAX, MAIL_TEMPLATE_PARAMS,
  type Actor, type MailTemplateField, type MailTemplateKind, type TemplateProblem,
} from '@shop/core';
import type { Locale, MessageKey, Translator } from '@shop/i18n';
import { describeTemplateProblem } from '~/lib/notifications/template-problems';

/** 한 메일의 고친 문구. 빈 칸은 사전의 기본 문구 */
export type MailWording = Partial<Readonly<Record<MailTemplateField, string>>>;

/**
 * 이 메일·말의 고친 문구.
 *
 * **못 읽으면 기본 문구로 보낸다.** 문구 표가 흔들렸다고 주문 안내가 안 나가면 안 된다 — 알림 문구 템플릿과 같은 판단.
 */
export async function getMailWording(kind: MailTemplateKind, locale: Locale): Promise<MailWording> {
  try {
    const row = await prisma.mailTemplate.findUnique({
      where: { kind_locale: { kind, locale } },
      select: { subject: true, heading: true, lead: true },
    });
    if (!row) return {};
    return Object.fromEntries(MAIL_TEMPLATE_FIELD.flatMap((f) => (row[f] ? [[f, row[f]]] : [])));
  } catch (error) {
    console.error('[mail] 문구 템플릿을 못 읽어 기본 문구로 보낸다', kind, error);
    return {};
  }
}

/**
 * 한 칸의 말 — 고친 문구가 있고 값이 다 채워지면 그것, 아니면 사전의 기본 문구.
 *
 * 메일을 만드는 코드가 칸마다 이것을 부른다. 끼울 값이 빠졌을 때 기본 문구로 물러나는 것은 알림과 같다 —
 * `{name}` 이 글자 그대로 받은편지함에 뜨면 안 된다.
 */
export function wordOf(
  t: Translator,
  wording: MailWording | undefined,
  field: MailTemplateField,
  key: MessageKey,
  vars: Readonly<Record<string, string>> = {},
): string {
  const custom = wording?.[field];
  if (custom !== undefined) {
    const rendered = renderTemplate(custom, vars);
    if (rendered !== null) return rendered;
  }
  return t(key, vars);
}

export interface MailTemplateRow {
  readonly kind: MailTemplateKind;
  readonly locale: string;
  readonly subject: string | null;
  readonly heading: string | null;
  readonly lead: string | null;
  readonly updatedAt: Date;
}

export async function getAllMailTemplates(actor: Actor): Promise<MailTemplateRow[]> {
  assertPermission(actor, 'notification:write');
  const rows = await prisma.mailTemplate.findMany({
    select: { kind: true, locale: true, subject: true, heading: true, lead: true, updatedAt: true },
  });
  return rows.flatMap((r) => (isMailTemplateKind(r.kind) ? [{ ...r, kind: r.kind }] : []));
}

export class MailTemplateError extends Error {
  constructor(readonly problems: Partial<Record<MailTemplateField, readonly TemplateProblem[]>>) {
    super(
      Object.entries(problems)
        .map(([field, list]) => `${FIELD_LABEL[field as MailTemplateField]}: ${(list ?? []).map(describeTemplateProblem).join(' ')}`)
        .join(' / '),
    );
    this.name = 'MailTemplateError';
  }
}

export const FIELD_LABEL: Readonly<Record<MailTemplateField, string>> = { subject: '제목', heading: '머리말', lead: '첫 문장' };

/** 칸마다 검사. 비운 칸(null)은 기본 문구라 보지 않는다 */
export function checkMailWording(
  kind: MailTemplateKind,
  wording: Readonly<Record<MailTemplateField, string | null>>,
): Partial<Record<MailTemplateField, TemplateProblem[]>> {
  const problems: Partial<Record<MailTemplateField, TemplateProblem[]>> = {};
  for (const field of MAIL_TEMPLATE_FIELD) {
    const body = wording[field];
    if (body === null) continue;
    const found = checkTemplateText(body, MAIL_TEMPLATE_PARAMS[kind][field], MAIL_TEMPLATE_MAX[field]);
    if (found.length > 0) problems[field] = found;
  }
  return problems;
}

type Wording = Readonly<Record<MailTemplateField, string | null>>;

/**
 * 저장. 칸을 null 로 보내면 그 칸은 기본 문구, 세 칸이 다 null 이면 줄을 지운다. 전후를 돌려준다(감사 로그는 라우트가).
 */
export async function saveMailTemplate(
  actor: Actor,
  input: { kind: MailTemplateKind; locale: Locale } & Wording,
): Promise<{ before: Wording; after: Wording }> {
  assertPermission(actor, 'notification:write');
  const after: Wording = {
    subject: input.subject?.trim() || null,
    heading: input.heading?.trim() || null,
    lead: input.lead?.trim() || null,
  };
  const problems = checkMailWording(input.kind, after);
  if (Object.keys(problems).length > 0) throw new MailTemplateError(problems);

  const where = { kind_locale: { kind: input.kind, locale: input.locale } };
  const existing = await prisma.mailTemplate.findUnique({ where, select: { subject: true, heading: true, lead: true } });
  const before: Wording = existing ?? { subject: null, heading: null, lead: null };

  if (after.subject === null && after.heading === null && after.lead === null) {
    if (existing) await prisma.mailTemplate.delete({ where });
  } else {
    await prisma.mailTemplate.upsert({
      where,
      update: { ...after, updatedBy: actor.id },
      create: { kind: input.kind, locale: input.locale, ...after, updatedBy: actor.id },
    });
  }
  return { before, after };
}
