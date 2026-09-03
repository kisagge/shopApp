'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, Button, Field } from '@shop/ui';
import { format, won } from '@shop/core';

interface WalletCoupon {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number;
  percent: number;
  maxDiscount: number | null;
  minimumOrder: number;
  usedAt: Date | string | null;
  expiresAt: Date | string;
  /**
   * 기간이 지났는가. **서버가 정해서 내려 준다.**
   * 렌더 중에 Date.now() 를 부르면 서버와 클라이언트가 다른 값을 봐서
   * 만료 표시가 어긋난다 — 화면이 깜빡이며 바뀌는 종류의 버그다.
   */
  expired: boolean;
}

/**
 * 쿠폰함.
 *
 * 쓴 쿠폰과 만료된 쿠폰도 지우지 않고 흐리게 남긴다. 조용히 사라지면
 * "분명히 있었는데" 가 되고, 그건 그대로 문의가 된다.
 */
export function CouponWallet({ initial }: { initial: readonly WalletCoupon[] }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function onClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setStatus('');

    const value = new FormData(event.currentTarget).get('code');
    const code = typeof value === 'string' ? value.trim() : '';

    try {
      const response = await fetch('/api/coupons/claim', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      const result = (await response.json()) as { name?: string; message?: string };
      if (!response.ok) {
        setError(result.message ?? '쿠폰을 받지 못했습니다.');
        return;
      }
      setStatus(`${result.name ?? '쿠폰'}을(를) 받았습니다.`);
      event.currentTarget.reset();
      router.refresh();
    } catch {
      setError('네트워크 오류로 받지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  const discountText = (c: WalletCoupon) =>
    c.kind === 'AMOUNT'
      ? `${format(won(c.value))}원 할인`
      : `${c.percent}% 할인${c.maxDiscount ? ` (최대 ${format(won(c.maxDiscount))}원)` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      <form
        onSubmit={(e) => void onClaim(e)}
        className="flex items-end gap-2 rounded-sm border border-[var(--border)] p-4"
      >
        <Field
          label="쿠폰 코드 등록"
          name="code"
          required
          maxLength={30}
          placeholder="WELCOME10"
          className="w-[200px] uppercase"
        />
        <Button type="submit" disabled={pending}>
          {pending ? '받는 중…' : '등록'}
        </Button>
      </form>

      <p aria-live="polite" className="text-[13px] text-[var(--fg-secondary)]">
        {status}
      </p>
      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      {initial.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-[var(--fg-muted)]">
          아직 받은 쿠폰이 없습니다. 위에 코드를 넣어 등록해 보세요.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {initial.map((c) => {
            const used = c.usedAt !== null;
            const expired = !used && c.expired;
            const dim = used || expired;
            return (
              <li
                key={c.id}
                className={`flex items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4 ${
                  dim ? 'opacity-55' : ''
                }`}
              >
                <div className="flex flex-col gap-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {c.name}
                    {/* 상태를 흐림으로만 알리지 않는다 */}
                    {used && <Badge tone="neutral">사용함</Badge>}
                    {expired && <Badge tone="neutral">기간 만료</Badge>}
                  </p>
                  <p className="text-[13px] text-[var(--fg-secondary)]">{discountText(c)}</p>
                  <p className="text-[12px] text-[var(--fg-muted)]">
                    {c.minimumOrder > 0 && `${format(won(c.minimumOrder))}원 이상 · `}
                    <span className="tnum">
                      {new Date(c.expiresAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    </span>
                    까지
                  </p>
                </div>
                <span className="tnum shrink-0 text-[11px] text-[var(--fg-muted)]">{c.code}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
