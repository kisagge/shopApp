import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { hasPermission } from '@shop/core';
import { MERCHANT_STATUS_LABEL, type MerchantStatusInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getMerchants } from '~/lib/queries/admin';
import { MerchantStatusForm } from './status-form';

export const metadata: Metadata = { title: '가맹점' };
export const dynamic = 'force-dynamic';

const TONE: Record<string, 'success' | 'danger' | 'info' | 'neutral'> = {
  APPROVED: 'success', PENDING: 'info', SUSPENDED: 'danger', TERMINATED: 'neutral',
};

const dateFormat = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeZone: 'Asia/Seoul' });

export default async function AdminMerchantsPage() {
  const actor = await requireAdmin('merchant:read');
  const merchants = await getMerchants(actor);
  const canApprove = hasPermission(actor, 'merchant:approve');
  const pending = merchants.filter((m) => m.status === 'PENDING').length;

  return (
    <>
      <header className="flex h-17 items-center justify-between gap-6 border-b border-[var(--border)] bg-[var(--bg)] px-8">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[19px] font-semibold tracking-tight">가맹점</h1>
          <p className="text-[13px] text-[var(--fg-muted)]">
            <span className="tnum font-semibold text-[var(--fg-secondary)]">{merchants.length}</span>곳
            {pending > 0 && (
              <span className="ml-2 text-warning">승인 대기 {pending}건</span>
            )}
          </p>
        </div>
      </header>

      <div className="p-8">
        {!canApprove && (
          <p className="mb-4 text-[12px] text-[var(--fg-muted)]">
            입점 승인은 슈퍼관리자만 할 수 있습니다.
          </p>
        )}

        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          <table>
            <caption className="sr-only">가맹점 목록</caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">가맹점</th>
                <th scope="col" className="w-52 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">사업자</th>
                <th scope="col" className="w-20 px-4 py-3 text-right text-xs text-[var(--fg-secondary)]">수수료</th>
                <th scope="col" className="w-28 px-4 py-3 text-center text-xs text-[var(--fg-secondary)]">상태</th>
                <th scope="col" className="w-64 px-4 py-3 text-left text-xs text-[var(--fg-secondary)]">
                  {canApprove ? '상태 변경' : '입점일'}
                </th>
              </tr>
            </thead>
            <tbody>
              {merchants.map((m) => (
                <tr key={m.id} className="border-b border-[var(--surface-2)] align-top last:border-0">
                  <td className="px-4 py-3">
                    <span className="block text-[13px]">{m.name}</span>
                    <span className="block text-[11px] text-[var(--fg-muted)]">
                      {m.brandNames.join(' · ') || '브랜드 없음'} · 계정 {m.userCount}개
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block text-[12px]">{m.businessName}</span>
                    <span className="tnum block text-[11px] text-[var(--fg-muted)]">
                      {m.businessNumber} · {m.representative}
                    </span>
                  </td>
                  <td className="tnum px-4 py-3 text-right text-[13px]">{m.commissionPercent}%</td>
                  <td className="px-4 py-3 text-center">
                    <Badge tone={TONE[m.status] ?? 'neutral'}>
                      {MERCHANT_STATUS_LABEL[m.status as MerchantStatusInput] ?? m.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {canApprove ? (
                      <MerchantStatusForm
                        merchantId={m.id}
                        merchantName={m.name}
                        status={m.status as MerchantStatusInput}
                      />
                    ) : (
                      <span className="text-[12px] text-[var(--fg-muted)]">
                        {m.approvedAt ? (
                          <time dateTime={m.approvedAt.toISOString()}>
                            {dateFormat.format(m.approvedAt)}
                          </time>
                        ) : (
                          '미승인'
                        )}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
