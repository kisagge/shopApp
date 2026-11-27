'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { CouponTable } from './coupon-table';
import { CouponForm } from './coupon-form';
import { CouponGrant } from './coupon-grant';
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
  /*
   * **목록을 상태로 베끼지 않는다.**
   *
   * `useState(initial)` 로 한 번 베껴 들고 있었다. 그러면 `router.refresh()` 가
   * 서버 조각을 다시 그려 새 `initial` 을 넘겨도 **그 상태는 바뀌지 않는다** —
   * 거울이 서버를 가린다. 지급은 그 모양에 정확히 걸렸다: 쿠폰을 쥐어 주면
   * 발급 수가 서버에서 늘지만 표는 계속 `0 / 50` 이었다.
   *
   * 쥐고 있던 값이 낡는다는 것은 아래 onDone 에 주석으로 적혀 있었고 refresh 도
   * 부르고 있었다 — **그 고침이 듣지 않는다는 것만 아무도 몰랐다**(지급 창구를
   * 사람이 쓰는 길에 검사가 없었다. coupon-grant-admin 이 그 자리를 밟는다).
   *
   * 낡으면 운영자가 **틀린 수를 보고 다음 지급을 셈한다** — 지급 창구는 같은
   * 줄에서 "남은 수량" 을 적고, 할인 내용을 고칠 수 있는지도 발급 수로 가른다.
   *
   * 그래서 서버가 준 것을 그대로 그리고, 바뀜은 전부 refresh 로 되돌려 받는다.
   * 손으로 셈해 끼우면 발급 수는 맞출 수 있어도 그에 딸린 값들(고칠 수 있는지,
   * 상태)이 또 어긋난다.
   */
  const coupons = initial;
  const [creating, setCreating] = useState(initial.length === 0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  /** 지금 지급 창구를 연 쿠폰. 한 번에 하나만 연다. */
  const [granting, setGranting] = useState<CouponRow | null>(null);

  async function patch(target: CouponRow, body: { isActive: boolean } | { downloadable: boolean }, done: string) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/coupons/${target.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json().catch(() => ({}))) as { coupon?: CouponRow; message?: string };
      if (!response.ok || !result.coupon) {
        setError(result.message ?? '바꾸지 못했습니다.');
        return;
      }
      setStatus(done);
      // 바뀐 줄은 서버에서 다시 받아 그린다
      router.refresh();
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
        <CouponTable
          coupons={coupons}
          pending={pending}
          onToggle={(c) => void patch(c, { isActive: !c.isActive }, c.isActive
            ? `${c.name} 쿠폰을 중지했습니다. 이미 받은 사람은 계속 쓸 수 있습니다.`
            : `${c.name} 쿠폰을 다시 열었습니다.`)}
          onToggleDownload={(c) => void patch(c, { downloadable: !c.downloadable }, c.downloadable
            ? `${c.name} 쿠폰을 받기 목록에서 내렸습니다. 이미 받은 사람은 계속 쓸 수 있습니다.`
            : `${c.name} 쿠폰을 누구나 받을 수 있게 공개했습니다.`)}
          onGrant={(coupon) => {
            setError(null);
            setGranting(coupon);
          }}
        />
      )}

      {granting && (
        <CouponGrant
          coupon={granting}
          onClose={() => setGranting(null)}
          onDone={({ issued, skipped }) => {
            setGranting(null);
            setStatus(
              skipped > 0
                ? `${issued}명에게 지급했습니다. ${skipped}명은 이미 갖고 있어 건너뛰었습니다.`
                : `${issued}명에게 지급했습니다.`,
            );
            // 발급 수가 늘었으므로 목록이 들고 있는 값이 낡는다
            router.refresh();
          }}
        />
      )}

      {creating ? (
        <CouponForm
          brands={brands}
          categories={categories}
          canCancel={coupons.length > 0}
          onError={setError}
          onCancel={() => setCreating(false)}
          onCreated={(coupon) => {
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
