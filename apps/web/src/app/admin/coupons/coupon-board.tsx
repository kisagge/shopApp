'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { CouponTable } from './coupon-table';
import { CouponForm } from './coupon-form';
import type { CouponRow, NamedOption } from './types';

/**
 * 쿠폰 목록과 발행.
 *
 * 할인 내용은 **한 장이라도 나가면 못 고친다.** 받은 사람은 그때 조건으로
 * 쓸 수 있다고 믿고 있다. 그래서 수정 자리를 따로 두지 않고, 목록에서는
 * 중지·재개와 기간 연장만 할 수 있게 했다.
 *
 * 만드는 폼은 따로 산다(coupon-form). 입력 중인 값과 검증 오류는 목록이
 * 알 필요가 없고, 취소하면 통째로 버려지는 것이 맞다.
 */
export function CouponBoard({
  initial,
  brands,
  categories,
}: {
  initial: readonly CouponRow[];
  brands: readonly NamedOption[];
  categories: readonly NamedOption[];
}) {
  const router = useRouter();
  const [coupons, setCoupons] = useState<readonly CouponRow[]>(initial);
  const [creating, setCreating] = useState(initial.length === 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function toggleActive(target: CouponRow) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/coupons/${target.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !target.isActive }),
      });
      const result = (await response.json()) as { coupon?: CouponRow; message?: string };
      if (!response.ok || !result.coupon) {
        setError(result.message ?? '바꾸지 못했습니다.');
        return;
      }
      setCoupons((list) => list.map((c) => (c.id === target.id ? result.coupon! : c)));
      setStatus(
        target.isActive
          ? `${target.name} 쿠폰을 중지했습니다. 이미 받은 사람은 계속 쓸 수 있습니다.`
          : `${target.name} 쿠폰을 다시 열었습니다.`,
      );
    } catch {
      setError('네트워크 오류로 바꾸지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" className="sr-only">{status}</p>
      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      {coupons.length > 0 && (
        <CouponTable coupons={coupons} pending={pending} onToggle={toggleActive} />
      )}

      {creating ? (
        <CouponForm
          brands={brands}
          categories={categories}
          canCancel={coupons.length > 0}
          onError={setError}
          onCancel={() => setCreating(false)}
          onCreated={(coupon) => {
            setCoupons((list) => [coupon, ...list]);
            setCreating(false);
            setStatus(`${coupon.name} 쿠폰을 만들었습니다.`);
            router.refresh();
          }}
        />
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setCreating(true)}>
            새 쿠폰 만들기
          </Button>
        </div>
      )}
    </div>
  );
}
