import type { Metadata } from 'next';
import { Badge } from '@shop/ui';
import { hasPermission, MERCHANT_STATUS_LABEL } from '@shop/core';
import type { MerchantStatusInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getMerchants } from '~/lib/queries/admin/merchants';
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

        {/*
          **비었을 때 그 이유를 말한다.** 표 머리만 남으면 고장인지 원래 그런
          건지 알 수 없다. 저장소를 처음 띄우면 가맹점이 하나도 없는 것이
          정상인데, 그때 화면이 아무 말도 안 하고 있었다.

          주문·정산 목록이 쓰는 모양을 그대로 따른다 — 표를 문구로 대체한다.
        */}
        {merchants.length === 0 ? (
          <p className="py-20 text-center text-[13px] text-[var(--fg-muted)]">
            아직 입점한 가맹점이 없습니다. 입점 신청이 들어오면 여기에 뜹니다.
          </p>
        ) : (
        <div className="rounded-md border border-[var(--border)] bg-[var(--bg)]">
          <div className="table-scroll">
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
                        {/*
                          승인 전에는 브랜드가 아직 없다. 그때는 신청서에 적은
                          이름을 보여 준다 — 무엇을 승인하는지 알아야 한다.
                        */}
                        {m.brandNames.join(' · ')
                          || (m.appliedBrandName ? `${m.appliedBrandName} (신청)` : '브랜드 없음')}
                        {' · 계정 '}
                        {m.userCount}개
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block text-[12px]">{m.businessName}</span>
                      <span className="tnum block text-[11px] text-[var(--fg-muted)]">
                        {m.businessNumber} · {m.representative}
                      </span>
                      {m.applicant && (
                        // 승인하면 이 계정이 가맹점 계정이 된다. 누구인지 보여야 한다.
                        <span className="block text-[11px] text-[var(--fg-muted)]">
                          신청 {m.applicant.name} · {m.applicant.email}
                        </span>
                      )}
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
        )}
      </div>
    </>
  );
}
