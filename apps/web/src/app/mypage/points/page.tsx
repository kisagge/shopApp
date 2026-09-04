import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { format, won, EXPIRY_NOTICE_DAYS } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { getPointHistory, getMyPageSummary, getExpiringPoints } from '~/lib/queries/mypage';

export const metadata: Metadata = { title: '포인트 내역' };
export const dynamic = 'force-dynamic';

const REASON_LABEL: Record<string, string> = {
  EARN_PURCHASE: '구매 적립',
  USE_PURCHASE: '구매 사용',
  EARN_REVIEW: '리뷰 적립',
  EARN_SIGNUP: '가입 적립',
  CANCEL_REFUND: '주문 취소 반환',
  EXPIRE: '소멸',
  ADMIN_ADJUST: '관리자 조정',
};

export default async function PointsPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage/points');

  const [summary, history, expiring] = await Promise.all([
    getMyPageSummary(session.id),
    getPointHistory(session.id),
    getExpiringPoints(session.id),
  ]);
  if (!summary) redirect('/login');

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label="현재 위치" className="pt-6 pb-2">
        <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">← 마이페이지</Link>
      </nav>
      <h1 className="pb-5 text-xl font-semibold tracking-tight md:text-2xl">포인트</h1>

      <p className="rounded-sm border border-[var(--border)] p-5 text-center">
        <span className="block text-[11px] text-[var(--fg-muted)]">사용 가능 포인트</span>
        <span className="tnum mt-1.5 block text-3xl font-semibold">
          {format(summary.pointBalance)}
          <span className="ml-1 text-lg">P</span>
        </span>
        {expiring > 0 && (
          // 말없이 사라지면 잔액이 왜 줄었는지 알 수 없다
          <span className="mt-2 block text-[12px] text-accent">
            이 중 <span className="tnum">{format(won(expiring))}P</span> 가 {EXPIRY_NOTICE_DAYS}일
            안에 사라집니다
          </span>
        )}
      </p>

      <section aria-labelledby="history-title" className="mt-8">
        <h2 id="history-title" className="mb-3.5 text-[15px] font-semibold">적립·사용 내역</h2>
        {history.length === 0 ? (
          <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
            아직 포인트 내역이 없습니다.
          </p>
        ) : (
          <table>
            <caption className="sr-only">포인트 적립 및 사용 내역</caption>
            <thead>
              <tr className="border-b border-[var(--border)]">
                <th scope="col" className="pb-2.5 text-[11px] text-[var(--fg-muted)]">내용</th>
                <th scope="col" className="pb-2.5 text-right text-[11px] text-[var(--fg-muted)]">변동</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={i} className="border-b border-[var(--surface-2)]">
                  <td className="py-3">
                    <span className="block text-[13px]">{REASON_LABEL[h.reason] ?? h.reason}</span>
                    {h.note && <span className="block text-[11px] text-[var(--fg-muted)]">{h.note}</span>}
                    <span className="tnum block text-[11px] text-[var(--fg-muted)]">
                      {h.createdAt.toLocaleDateString('ko-KR')}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    {/* 부호를 색으로만 알리지 않는다 — + / − 를 함께 쓴다 */}
                    <span
                      className={`tnum text-sm font-semibold ${h.amount > 0 ? 'text-success' : 'text-[var(--fg)]'}`}
                    >
                      {h.amount > 0 ? '+' : '−'}
                      {format(won(Math.abs(h.amount)))}P
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
