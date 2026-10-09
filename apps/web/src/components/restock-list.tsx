'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Badge, Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';

export interface RestockRowView {
  readonly variantId: string;
  readonly optionLabel: string;
  readonly productName: string;
  readonly productSlug: string;
  readonly brandName: string;
  readonly inStock: boolean;
  readonly notified: boolean;
  /** 지금 매대에 없는 상품 — 기다려도 알림이 가지 않는다 */
  readonly unavailable?: boolean;
}

/**
 * 걸어 둔 재입고 알림 목록.
 *
 * **지우기가 실패하면 아무 말도 안 했다.** 실패 문구가 `sr-only` 한 곳에만 있어서, 눈으로 보는 사람에게는
 * 단추를 눌렀는데 줄이 그대로 남아 있을 뿐이었다 — 왜 안 됐는지도, 다시 누르면 되는지도 화면에 없다.
 * 이 저장소는 그 짝을 이미 쓴다(쿠폰 받기): **성공은 sr-only 알림, 실패는 보이는 `role="alert"`.**
 *
 * **성공 알림도 사라졌다.** 줄마다 알림 자리를 두고 그 자리에 글을 채운 뒤 목록을 다시 그렸으므로, 방금
 * 글을 채운 요소가 새 목록에는 없었다. 알림 자리는 **늘 DOM 에 두고 목록 바깥에** 둔다(최근 본 상품이
 * 같은 이유로 그렇게 한다).
 *
 * 그리고 지우기 단추는 자기 줄과 함께 사라지므로 초점을 챙긴다(useRemovalFocus) — 안 챙기면 셋을
 * 지우려고 문서 맨 앞에서 세 번 내려와야 한다.
 */
export function RestockList({ rows }: { rows: readonly RestockRowView[] }) {
  const t = useT();
  const router = useRouter();
  const { listRef, rememberRemoval } = useRemovalFocus(rows.length);
  const [pending, setPending] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function remove(row: RestockRowView, index: number): Promise<void> {
    if (pending) return;
    setPending(row.variantId);
    setError(null);
    try {
      const res = await fetch(`/api/restock/${row.variantId}`, { method: 'DELETE' });
      if (!res.ok) {
        setError(t('restock.deleteFailed'));
        return;
      }
      rememberRemoval(index);
      setStatus(t('restock.deleted', { name: row.productName }));
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {/* 목록에서 한 줄이 사라지는 것은 눈으로만 보이는 변화다. 자리는 늘 둔다 — 지우는 순간 만들면 놓친다 */}
      <p aria-live="polite" className="sr-only">{status}</p>
      {/* 실패는 눈에도 보인다 — 낭독기에만 들리면 보고 있는 사람에게는 아무 일도 안 일어난 것이다 */}
      {error && (
        <p role="alert" className="mb-3 rounded-sm bg-accent-soft px-3.5 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}

      <ul ref={listRef as React.RefObject<HTMLUListElement>} className="flex flex-col gap-2.5">
        {rows.map((r, index) => (
          <li
            key={r.variantId}
            className="flex items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4"
          >
            <div className="flex flex-col gap-1">
              <p className="text-[10px] tracking-[0.08em] text-[var(--fg-muted)]">{r.brandName}</p>
              <p className="flex items-center gap-2 text-sm font-medium">
                <Link href={`/product/${r.productSlug}`} className="text-[var(--fg)]">
                  {r.productName}
                </Link>
                {/* 상태를 색으로만 알리지 않는다 */}
                {r.notified && <Badge tone="success">{t('my.restocked')}</Badge>}
                {/* 상태를 색으로만 알리지 않는다 — 찜 목록과 같은 말을 쓴다 */}
                {r.unavailable && (
                  <span className="text-[11px] font-medium text-accent">{t('my.discontinued')}</span>
                )}
              </p>
              <p className="text-[13px] text-[var(--fg-secondary)]">{r.optionLabel}</p>
              {/*
                **기다려도 오지 않는다는 것을 말한다.** 신청은 매대에 서 있을 때만 받고 보내는 쪽도
                같은 것을 보는데, 그 사이에 상품이 내려가면 이 줄은 영영 기다리는 줄이 된다.
              */}
              {r.unavailable && (
                <p className="text-[12px] text-[var(--fg-muted)]">{t('my.restockUnavailable')}</p>
              )}
              {!r.unavailable && r.notified && !r.inStock && (
                <p className="text-[12px] text-[var(--fg-muted)]">{t('my.restockedThenOut')}</p>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              data-remove-row
              // 눌리기는 하므로(aria-disabled) 두 번 보내는 것은 핸들러가 막는다
              aria-disabled={pending === r.variantId}
              // "삭제" 만 있으면 스크린리더로는 어느 줄의 삭제인지 알 수 없다
              aria-label={t('restock.deleteNamed', { name: r.productName })}
              onClick={() => void remove(r, index)}
            >
              {t('review.delete')}
            </Button>
          </li>
        ))}
      </ul>
    </>
  );
}
