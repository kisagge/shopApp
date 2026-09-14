import type { Metadata } from 'next';
import Link from 'next/link';
import {
  CONSOLE_NOTIFICATION_KIND, NOTIFICATION_KIND, NOTIFICATION_PARAMS, NOTIFICATION_SAMPLE_PARAMS,
  type NotificationKind,
} from '@shop/core';
import { LOCALES, LOCALE_LABEL, isLocale, type Locale } from '@shop/i18n';
import { DICTIONARIES } from '@shop/i18n/all';
import { requireAdmin } from '~/lib/admin/guard';
import { getAllNotificationTemplates } from '~/lib/notifications/templates';
import { TemplateForm } from './template-form';

export const metadata: Metadata = { title: '알림 문구' };
export const dynamic = 'force-dynamic';

/** 운영자가 알아보는 이름 — 코드 이름(ORDER_SHIPPED)은 옆에 작게 둔다 */
const KIND_LABEL: Record<NotificationKind, string> = {
  ORDER_SHIPPED: '출고',
  ORDER_DELIVERED: '배송 완료',
  INQUIRY_ANSWERED: '문의 답변',
  RESTOCKED: '재입고',
  COUPON_ISSUED: '쿠폰 지급',
  STOCK_LOW: '재고 부족',
};

/** 값의 뜻. 자리 이름만 보여 주면 {optionLabel} 이 무엇인지 모른다 */
const PARAM_LABEL: Record<string, string> = {
  orderNo: '주문번호',
  productName: '상품 이름',
  optionLabel: '옵션',
  couponName: '쿠폰 이름',
  stock: '남은 재고',
};

/**
 * 알림 문구 템플릿.
 *
 * 말마다 따로 고친다 — 한 화면에 세 말을 다 펼치면 열여덟 칸이 되고, 고치는 사람은 보통 한 말만 본다. 말은 주소
 * (`?locale=`)에 두어 새로 고쳐도, 링크로 넘겨도 같은 말이 열린다.
 */
export default async function NotificationTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>;
}) {
  const actor = await requireAdmin('notification:write');
  const { locale: raw } = await searchParams;
  const locale: Locale = raw && isLocale(raw) ? raw : 'ko';

  const rows = await getAllNotificationTemplates(actor);
  const custom = new Map(rows.filter((r) => r.locale === locale).map((r) => [r.kind, r]));
  const dict = DICTIONARIES[locale] as Readonly<Record<string, unknown>>;

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 sm:py-0 border-b border-[var(--border)] bg-[var(--bg)] px-4 sm:px-8">
        <h1 className="text-[19px] font-semibold tracking-tight">알림 문구</h1>
        <p className="text-[13px] text-[var(--fg-muted)]">고치면 이미 온 알림도 새 문구로 보입니다</p>
      </header>

      <div className="flex flex-col gap-5 p-4 sm:p-8">
        <nav aria-label="문구 언어" className="flex gap-1">
          {LOCALES.map((l) => (
            <Link
              key={l}
              href={{ pathname: '/admin/notification-templates', query: { locale: l } }}
              aria-current={l === locale ? 'page' : undefined}
              className={`rounded-sm px-3 py-2 text-[13px] no-underline ${
                l === locale
                  ? 'bg-[var(--brand)] font-medium text-[var(--bg)]'
                  : 'border border-[var(--border-strong)] text-[var(--fg-secondary)]'
              }`}
            >
              {LOCALE_LABEL[l]}
            </Link>
          ))}
        </nav>

        <p className="max-w-[720px] text-[12px] leading-relaxed text-[var(--fg-muted)]">
          값을 끼울 자리는 <code>{'{이름}'}</code> 처럼 적습니다. 알림마다 쓸 수 있는 값이 정해져 있고, 없는 값을 적으면
          저장되지 않습니다. 끼울 값이 빠진 옛 알림(지워진 상품의 문의 답변 등)은 기본 문구로 보입니다.
        </p>

        <div className="grid gap-4 xl:grid-cols-2">
          {NOTIFICATION_KIND.map((kind) => {
            const row = custom.get(kind);
            const found = dict[`notif.${kind}`];
            const defaultBody = typeof found === 'string' ? found : '';
            const where = (CONSOLE_NOTIFICATION_KIND as readonly string[]).includes(kind) ? '운영 알림함' : '매장 알림함';
            return (
              <TemplateForm
                key={`${kind}:${locale}`}
                kind={kind}
                locale={locale}
                title={KIND_LABEL[kind]}
                where={where}
                defaultBody={defaultBody}
                customBody={row?.body ?? null}
                updatedAt={row ? row.updatedAt.toISOString() : null}
                params={NOTIFICATION_PARAMS[kind].map((name) => ({ name, label: PARAM_LABEL[name] ?? name }))}
                sample={NOTIFICATION_SAMPLE_PARAMS}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
