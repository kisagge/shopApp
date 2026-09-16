import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@shop/ui';
import {
  MERCHANT_STATUS_LABEL, canEditMerchantSettings, canEditReturnAddress, hasPermission,
} from '@shop/core';
import type { MerchantStatusInput } from '@shop/contract';
import { requireAdmin } from '~/lib/admin/guard';
import { getMerchantDetail } from '~/lib/queries/admin/merchants';
import { getAuditLogs } from '~/lib/queries/audit-log';
import { actionLabel } from '~/lib/admin/audit-labels';
import { MerchantStatusForm } from '../status-form';
import { adminDate, adminDateTime } from '~/lib/admin/date-format';

export const metadata: Metadata = { title: '가맹점 상세' };
export const dynamic = 'force-dynamic';

/** 이 화면에서 보여 줄 지난 기록의 수. 전부는 감사 로그 화면에서 본다 */
const HISTORY_LIMIT = 10;

/**
 * 가맹점 하나를 자세히.
 *
 * **목록 한 줄에 다 담을 수 없는 것들이 있었다.** 그중 하나가 반려 사유다 — 신청한
 * 사람은 신청 화면에서 보는데 정작 반려한 운영진은 나중에 이유를 못 봤고, 감사
 * 로그를 뒤지는 수밖에 없었다.
 *
 * **지난 기록을 함께 놓는다.** "이 가맹점이 왜 정지됐나" 는 지금 상태만 봐서는 알 수
 * 없는 물음이다. 감사 로그가 그 답을 쥐고 있었지만 대상 하나로 좁힐 길이 없어서
 * (종류로만 걸렀다) 모든 가맹점의 기록이 섞여 나왔다.
 *
 * 가맹점 계정도 들어오되 **자기 것만** 본다. 남의 id 를 치면 없는 화면으로 답한다 —
 * 있는지조차 새지 않게(설정 화면과 같은 규칙).
 */
export default async function MerchantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireAdmin('merchant:read');
  const { id } = await params;

  const merchant = await getMerchantDetail(actor, id);
  if (!merchant) notFound();

  /*
   * 지난 기록은 감사 로그를 볼 수 있는 사람에게만. 가맹점 계정에게 "누가 언제
   * 정지했는지" 까지 보여 줄 이유는 없다.
   */
  // 감사 로그 화면이 가리는 것과 같은 권한을 본다 — 한쪽만 열리면 안 된다
  const canReadAudit = hasPermission(actor, 'user:read');
  const history = canReadAudit
    ? (await getAuditLogs(actor, { targetType: 'merchant', targetId: id, take: HISTORY_LIMIT })).rows
    : [];

  const status = merchant.status as MerchantStatusInput;
  const canChangeStatus = hasPermission(actor, 'merchant:approve');

  return (
    <>
      <header className="flex min-h-17 flex-wrap items-center gap-x-3 gap-y-2 border-b border-[var(--border)] bg-[var(--bg)] px-4 py-3 sm:px-8 sm:py-0">
        <nav aria-label="현재 위치">
          <ol className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--fg-muted)]">
            <li>
              <Link href="/admin/merchants" className="no-underline hover:underline">가맹점</Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-[var(--fg)]">{merchant.name}</li>
          </ol>
        </nav>
      </header>

      <div className="flex flex-col gap-5 p-4 sm:p-8">
        <section
          aria-labelledby="state-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <h2 id="state-title" className="text-base font-semibold">지금 상태</h2>
            {/* 색만으로 말하지 않는다 — 이름표를 함께 읽는다 */}
            <Badge tone={status === 'APPROVED' ? 'success' : status === 'PENDING' ? 'info' : 'danger'}>
              {MERCHANT_STATUS_LABEL[status] ?? merchant.status}
            </Badge>
          </div>

          <dl className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-[var(--fg-muted)]">신청일</dt>
            <dd className="tnum">{adminDate.format(merchant.createdAt)}</dd>

            <dt className="text-[var(--fg-muted)]">승인일</dt>
            <dd className="tnum">{merchant.approvedAt ? adminDate.format(merchant.approvedAt) : '—'}</dd>

            {/*
              **반려 사유는 여기 말고 볼 자리가 없었다.** 신청한 사람은 신청 화면에서
              보는데 반려한 운영진은 감사 로그를 뒤져야 했다.
            */}
            {merchant.rejectionReason && (
              <>
                <dt className="text-[var(--fg-muted)]">반려 사유</dt>
                <dd className="whitespace-pre-wrap">{merchant.rejectionReason}</dd>
              </>
            )}
          </dl>

          {canChangeStatus && (
            <div className="mt-5 border-t border-[var(--border)] pt-4">
              <MerchantStatusForm merchantId={merchant.id} merchantName={merchant.name} status={status} />
            </div>
          )}
        </section>

        <section
          aria-labelledby="applied-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="applied-title" className="mb-4 text-base font-semibold">신청서에 적어 낸 것</h2>
          <dl className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
            <dt className="text-[var(--fg-muted)]">상호</dt>
            <dd>{merchant.businessName}</dd>

            <dt className="text-[var(--fg-muted)]">사업자번호</dt>
            {/* 뒤 두 자리는 가린다 — 대조에는 쓰되 그대로 흘리지는 않는다(목록과 같은 규칙) */}
            <dd className="tnum">{merchant.businessNumber}</dd>

            <dt className="text-[var(--fg-muted)]">대표자</dt>
            <dd>{merchant.representative}</dd>

            <dt className="text-[var(--fg-muted)]">연락처</dt>
            <dd>
              {merchant.contactEmail}
              <span aria-hidden="true"> · </span>
              <span className="tnum">{merchant.contactPhone}</span>
            </dd>

            <dt className="text-[var(--fg-muted)]">브랜드명</dt>
            <dd>{merchant.appliedBrandName ?? '—'}</dd>

            <dt className="text-[var(--fg-muted)]">신청자</dt>
            <dd>
              {merchant.applicant
                ? `${merchant.applicant.name} (${merchant.applicant.email})`
                : '운영진이 직접 만든 가맹점'}
            </dd>
          </dl>
        </section>

        <section
          aria-labelledby="linked-title"
          className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
        >
          <h2 id="linked-title" className="mb-4 text-base font-semibold">붙어 있는 것</h2>

          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: '브랜드', value: merchant.brandNames.length },
              { label: '계정', value: merchant.userCount },
              { label: '상품', value: merchant.productCount },
              { label: '지급 대기 정산', value: merchant.settlementCount },
            ].map((tile) => (
              <li
                key={tile.label}
                className="flex flex-col gap-1 rounded-sm border border-[var(--border)] p-4"
              >
                <span className="text-[11px] text-[var(--fg-muted)]">{tile.label}</span>
                <span className="tnum text-[20px] font-semibold">{tile.value.toLocaleString('ko-KR')}</span>
              </li>
            ))}
          </ul>

          {merchant.brandNames.length > 0 && (
            <p className="mt-4 text-[13px] text-[var(--fg-secondary)]">
              {merchant.brandNames.join(' · ')}
            </p>
          )}

          {/*
            **못 하는 일을 미리 말한다.** 반품지가 없으면 이 가맹점 상품의 반품을
            승인할 수 없고, 계좌가 없으면 확정된 정산을 지급할 수 없다 — 그때 가서
            막히는 것보다 여기서 보이는 편이 낫다.
          */}
          {(!merchant.hasReturnAddress || !merchant.hasSettlementAccount) && (
            <p role="status" className="mt-4 rounded-sm bg-[var(--surface)] px-3 py-2 text-[12px]">
              {!merchant.hasReturnAddress && '반품지가 없어 이 가맹점 상품의 반품을 승인할 수 없습니다. '}
              {!merchant.hasSettlementAccount && '정산 계좌가 없어 확정된 정산을 지급할 수 없습니다.'}
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-3 text-[13px]">
            {canEditReturnAddress(actor, merchant.id) && (
              <Link href={`/admin/merchants/${merchant.id}/return-address`} className="underline">
                반품지
              </Link>
            )}
            {canEditMerchantSettings(actor, merchant.id) && (
              <Link href={`/admin/merchants/${merchant.id}/settings`} className="underline">
                정보 · 정산 계좌
              </Link>
            )}
          </div>
        </section>

        {canReadAudit && (
          <section
            aria-labelledby="history-title"
            className="rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
          >
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="history-title" className="text-base font-semibold">지난 기록</h2>
              <Link
                href={{ pathname: '/admin/audit', query: { targetType: 'merchant' } }}
                className="text-[13px] underline"
              >
                감사 로그에서 보기
              </Link>
            </div>

            {history.length === 0 ? (
              <p className="py-8 text-center text-[13px] text-[var(--fg-muted)]">
                아직 남은 기록이 없습니다.
              </p>
            ) : (
              <ul className="flex flex-col gap-2 text-[13px]">
                {history.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <time dateTime={row.createdAt.toISOString()} className="tnum text-[var(--fg-muted)]">
                      {adminDateTime.format(row.createdAt)}
                    </time>
                    <span>{actionLabel(row.action)}</span>
                    <span className="text-[var(--fg-muted)]">{row.actorName ?? '배치'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </>
  );
}
