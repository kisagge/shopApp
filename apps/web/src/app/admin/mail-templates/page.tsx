import type { Metadata } from 'next';
import Link from 'next/link';
import {
  MAIL_TEMPLATE_KIND, MAIL_TEMPLATE_PARAMS, MAIL_TEMPLATE_MAX, isMailTemplateKind,
  type MailTemplateField, type MailTemplateKind,
} from '@shop/core';
import { LOCALES, LOCALE_LABEL, isLocale, type Locale } from '@shop/i18n';
import { DICTIONARIES } from '@shop/i18n/all';
import { requireAdmin } from '~/lib/admin/guard';
import { getAllMailTemplates } from '~/lib/mail/templates';
import { MailTemplateForm } from './mail-template-form';

export const metadata: Metadata = { title: '메일 문구' };
export const dynamic = 'force-dynamic';

const KIND_LABEL: Record<MailTemplateKind, string> = {
  ORDER_PAID: '주문 완료',
  ORDER_PENDING: '입금 대기(가상계좌)',
  ORDER_DEPOSITED: '입금 확인',
  RESTOCK: '재입고',
  INQUIRY_ANSWERED: '문의 답변',
};

/** 기본 문구가 사전의 어느 열쇠인가 — 칸을 비우면 이 말이 나간다 */
const DEFAULT_KEY: Record<MailTemplateKind, Record<MailTemplateField, string>> = {
  ORDER_PAID: { subject: 'mail.order.paidSubject', heading: 'mail.order.paidHeading', lead: 'mail.order.paidLead' },
  ORDER_PENDING: { subject: 'mail.order.pendingSubject', heading: 'mail.order.pendingHeading', lead: 'mail.order.pendingLead' },
  ORDER_DEPOSITED: { subject: 'mail.order.depositedSubject', heading: 'mail.order.depositedHeading', lead: 'mail.order.depositedLead' },
  RESTOCK: { subject: 'mail.restock.subject', heading: 'mail.restock.heading', lead: 'mail.restock.lead' },
  INQUIRY_ANSWERED: { subject: 'mail.inquiry.subject', heading: 'mail.inquiry.heading', lead: 'mail.inquiry.lead' },
};

const PARAM_LABEL: Record<string, string> = { orderNo: '주문번호', name: '주문자 이름', item: '상품(옵션)', about: '문의한 상품' };

/**
 * 메일 문구.
 *
 * 메일 하나·말 하나를 골라 고친다 — 세 말·다섯 메일·세 칸을 한 화면에 펼치면 마흔다섯 칸이다. 고른 것은 주소에 둔다.
 * 표·금액·버튼은 고칠 수 없다고 화면에 적어 둔다: 거기까지 문구로 열면 거래 내용을 바꿀 수 있게 된다.
 */
export default async function MailTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; kind?: string }>;
}) {
  const actor = await requireAdmin('notification:write');
  const params = await searchParams;
  const locale: Locale = params.locale && isLocale(params.locale) ? params.locale : 'ko';
  const kind: MailTemplateKind = params.kind && isMailTemplateKind(params.kind) ? params.kind : 'ORDER_PAID';

  const rows = await getAllMailTemplates(actor);
  const row = rows.find((r) => r.kind === kind && r.locale === locale) ?? null;
  const dict = DICTIONARIES[locale] as Readonly<Record<string, unknown>>;
  const defaults = Object.fromEntries(
    (['subject', 'heading', 'lead'] as const).map((f) => {
      const found = dict[DEFAULT_KEY[kind][f]];
      return [f, typeof found === 'string' ? found : ''];
    }),
  ) as Record<MailTemplateField, string>;
  const edited = new Set(rows.filter((r) => r.locale === locale).map((r) => r.kind));

  const tab = (active: boolean) =>
    `rounded-sm px-3 py-2 text-[13px] no-underline ${
      active ? 'bg-[var(--brand)] font-medium text-[var(--bg)]' : 'border border-[var(--border-strong)] text-[var(--fg-secondary)]'
    }`;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">메일 문구</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">제목·머리말·첫 문장만 고칩니다. 표·금액·버튼은 그대로입니다</p>
      </header>

      <div className="flex flex-col gap-5 p-4 sm:p-8">
        <nav aria-label="문구 언어" className="flex flex-wrap gap-1">
          {LOCALES.map((l) => (
            <Link key={l} href={{ pathname: '/admin/mail-templates', query: { locale: l, kind } }} aria-current={l === locale ? 'page' : undefined} className={tab(l === locale)}>
              {LOCALE_LABEL[l]}
            </Link>
          ))}
        </nav>
        <nav aria-label="메일 종류" className="flex flex-wrap gap-1">
          {MAIL_TEMPLATE_KIND.map((k) => (
            <Link key={k} href={{ pathname: '/admin/mail-templates', query: { locale, kind: k } }} aria-current={k === kind ? 'page' : undefined} className={tab(k === kind)}>
              {KIND_LABEL[k]}
              {edited.has(k) && <span className="ml-1 text-[11px]">(고침)</span>}
            </Link>
          ))}
        </nav>

        <p className="max-w-[720px] text-[12px] leading-relaxed text-[var(--fg-muted)]">
          칸을 비워 두면 기본 문구가 나갑니다. 값을 끼울 자리는 <code>{'{이름}'}</code> 처럼 적고, 칸마다 쓸 수 있는 값이 정해져
          있습니다. 인증·비밀번호 재설정 메일은 보안 안내라 여기서 고칠 수 없습니다.
        </p>

        <MailTemplateForm
          key={`${kind}:${locale}`}
          kind={kind}
          locale={locale}
          title={KIND_LABEL[kind]}
          defaults={defaults}
          saved={{ subject: row?.subject ?? null, heading: row?.heading ?? null, lead: row?.lead ?? null }}
          params={Object.fromEntries(
            (['subject', 'heading', 'lead'] as const).map((f) => [
              f,
              MAIL_TEMPLATE_PARAMS[kind][f].map((name: string) => ({ name, label: PARAM_LABEL[name] ?? name })),
            ]),
          ) as Record<MailTemplateField, { name: string; label: string }[]>}
          max={MAIL_TEMPLATE_MAX}
        />
      </div>
    </>
  );
}
