'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

export interface StockRow {
  readonly id: string;
  readonly sku: string;
  readonly optionLabel: string;
  readonly stock: number;
  readonly isActive: boolean;
}

/**
 * 재고 조정 표.
 *
 * 값을 **덮어쓰는** 동작이라, 저장 뒤에는 반드시 서버 값을 다시 읽어 온다
 * (router.refresh). 저장하는 사이 팔린 수량이 있으면 화면에 남아 있던 숫자가
 * 실제와 어긋나기 때문이다.
 */
export function StockForm({ productId, variants }: { productId: string; variants: readonly StockRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(() => variants.map((v) => ({ ...v })));
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  const dirty = rows.some((r, i) => {
    const o = variants[i];
    return o !== undefined && (o.stock !== r.stock || o.isActive !== r.isActive);
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/stock`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variants: rows.map((r) => ({ variantId: r.id, stock: r.stock, isActive: r.isActive })),
        }),
      });
      const data = (await response.json()) as { message?: string; updated?: number };
      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? '재고를 저장하지 못했습니다.' });
        return;
      }
      setMessage({ tone: 'ok', text: `${data.updated ?? rows.length}개 옵션의 재고를 반영했습니다.` });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '네트워크 오류로 저장하지 못했습니다.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-4">
      <div className="table-scroll">
        <table>
          <caption className="sr-only">옵션별 재고</caption>
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th scope="col" className="px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">옵션</th>
              <th scope="col" className="w-32 px-3 py-2.5 text-left text-xs text-[var(--fg-secondary)]">SKU</th>
              <th scope="col" className="w-28 px-3 py-2.5 text-right text-xs text-[var(--fg-secondary)]">재고</th>
              <th scope="col" className="w-20 px-3 py-2.5 text-center text-xs text-[var(--fg-secondary)]">판매</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-[var(--surface-2)] last:border-0">
                <td className="px-3 py-2.5 text-[13px]">{r.optionLabel}</td>
                <td className="px-3 py-2.5 text-[11px] text-[var(--fg-muted)]">{r.sku}</td>
                <td className="px-3 py-2">
                  <label className="sr-only" htmlFor={`stock-${r.id}`}>
                    {r.optionLabel} 재고 수량
                  </label>
                  <input
                    id={`stock-${r.id}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={999999}
                    value={r.stock}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((p, j) =>
                          j === i ? { ...p, stock: Math.max(0, Number(e.target.value) || 0) } : p,
                        ),
                      )
                    }
                    className="tnum h-10 w-full rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-right text-[13px]"
                  />
                </td>
                <td className="px-3 py-2 text-center">
                  <label className="sr-only" htmlFor={`active-${r.id}`}>
                    {r.optionLabel} 판매 여부
                  </label>
                  <input
                    id={`active-${r.id}`}
                    type="checkbox"
                    checked={r.isActive}
                    onChange={(e) =>
                      setRows((prev) =>
                        prev.map((p, j) => (j === i ? { ...p, isActive: e.target.checked } : p)),
                      )
                    }
                    className="size-4.5 accent-[var(--brand)]"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {message && (
        <p
          role="status"
          className={`text-[12px] ${message.tone === 'ok' ? 'text-success' : 'text-accent'}`}
        >
          {message.text}
        </p>
      )}

      <div>
        <Button type="submit" size="md" variant="secondary" disabled={pending || !dirty}>
          {pending ? '반영 중…' : '재고 반영'}
        </Button>
      </div>
    </form>
  );
}
