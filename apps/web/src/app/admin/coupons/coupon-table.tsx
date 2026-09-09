'use client';

import { Badge, Button } from '@shop/ui';
import { format, won, COUPON_KIND_LABEL, COUPON_STATUS_LABEL } from '@shop/core';
import type { CouponRow } from './types';

const dateText = (v: string | Date) =>
  new Date(v).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' });

const discountText = (c: CouponRow) =>
  c.kind === 'AMOUNT'
    ? `${format(won(c.value))}원`
    : `${c.percent}%${c.maxDiscount ? ` (최대 ${format(won(c.maxDiscount))}원)` : ''}`;

/** 발행한 쿠폰. 할인 내용은 못 고치므로 여기서 할 수 있는 것은 중지·재개뿐이다. */
export function CouponTable({
  coupons, pending, onToggle, onGrant,
}: {
  coupons: readonly CouponRow[];
  pending: boolean;
  onToggle: (coupon: CouponRow) => void;
  onGrant: (coupon: CouponRow) => void;
}) {
  return (
    /*
      **relative 가 있어야 낭독기 전용 글자가 새어 나가지 않는다.**

      마지막 열 머리('동작')는 눈에는 안 보이고 낭독기만 읽는 sr-only 다.
      그런데 sr-only 는 absolute 라 기준점이 없으면 화면 전체를 기준으로 잡고,
      **가로로 미는 상자 안에 있으면 그 상자를 빠져나가** 문서를 늘린다 —
      표는 안에서 잘 스크롤되는데 페이지가 1008px 이 되어 통째로 옆으로
      밀렸다. 눈으로는 표 말고 아무것도 안 보이니 원인을 찾기 어렵다.
    */
    <div className="relative overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--bg)]">
      <table className="w-full min-w-[860px] border-collapse text-[13px]">
        <caption className="sr-only">발행한 쿠폰 목록</caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-left text-xs text-[var(--fg-muted)]">
            <th scope="col" className="px-4 py-3 font-medium">쿠폰</th>
            <th scope="col" className="px-4 py-3 font-medium">할인</th>
            <th scope="col" className="px-4 py-3 font-medium">최소 주문</th>
            <th scope="col" className="px-4 py-3 font-medium">대상</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">발급 / 사용</th>
            <th scope="col" className="px-4 py-3 font-medium">기간</th>
            <th scope="col" className="px-4 py-3 font-medium">상태</th>
            <th scope="col" className="px-4 py-3 font-medium"><span className="sr-only">동작</span></th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((c) => (
            <tr key={c.id} className="border-b border-[var(--border)] last:border-0">
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">{c.name}</span>
                  <span className="tnum text-[11px] text-[var(--fg-muted)]">{c.code}</span>
                </span>
              </th>
              <td className="px-4 py-3">
                <span className="flex flex-col gap-0.5">
                  <span>{discountText(c)}</span>
                  <span className="text-[11px] text-[var(--fg-muted)]">
                    {COUPON_KIND_LABEL[c.kind as 'AMOUNT' | 'PERCENT']}
                  </span>
                </span>
              </td>
              <td className="tnum px-4 py-3">
                {c.minimumOrder === 0 ? '없음' : `${format(won(c.minimumOrder))}원`}
              </td>
              <td className="px-4 py-3 text-[12px]">
                {c.targetCount === 0 ? (
                  '전체'
                ) : (
                  <span className="tnum">지정 {c.targetCount}개</span>
                )}
              </td>
              <td className="tnum px-4 py-3 text-right">
                {c.issuedCount}
                {c.issueLimit === null ? '' : ` / ${c.issueLimit}`}
                <span className="text-[var(--fg-muted)]"> · 사용 {c.usedCount}</span>
              </td>
              <td className="tnum px-4 py-3 text-[12px] text-[var(--fg-secondary)]">
                {dateText(c.startsAt)} ~ {dateText(c.endsAt)}
              </td>
              <td className="px-4 py-3">
                <Badge tone={c.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {COUPON_STATUS_LABEL[c.status]}
                </Badge>
              </td>
              <td className="px-4 py-3 text-right">
                <span className="flex justify-end gap-1.5">
                  {/*
                    중지된 쿠폰은 지급할 수 없다. 창구가 어차피 거절하지만,
                    누를 수 있게 두면 눌러 보고 나서야 알게 된다.
                  */}
                  {c.isActive && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => onGrant(c)}
                      aria-label={`${c.name} 쿠폰 지급`}
                    >
                      지급
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={pending}
                    onClick={() => onToggle(c)}
                    aria-label={`${c.name} 쿠폰 ${c.isActive ? '중지' : '재개'}`}
                  >
                    {c.isActive ? '중지' : '재개'}
                  </Button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
