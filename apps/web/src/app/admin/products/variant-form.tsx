'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';

/** 옵션 추가 폼. 등록 직후 상품은 옵션이 없어 판매할 수 없다. */
export function VariantForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [sku, setSku] = useState('');
  const [optionLabel, setOptionLabel] = useState('');
  const [stock, setStock] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const headingId = useId();

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/products/${productId}/variants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sku, optionLabel, stock: Number(stock) || 0 }),
      });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '옵션을 추가하지 못했습니다.');
        return;
      }
      setSku('');
      setOptionLabel('');
      setStock('0');
      router.refresh();
    } catch {
      setError('네트워크 오류로 추가하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => onSubmit(e)} noValidate aria-labelledby={headingId} className="flex flex-col gap-4">
      <h3 id={headingId} className="text-xs font-semibold tracking-wide text-[var(--fg-secondary)]">
        옵션 추가
      </h3>

      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_120px]">
        <Field
          label="옵션명"
          required
          value={optionLabel}
          onChange={(e) => setOptionLabel(e.target.value)}
          placeholder="오트밀 / M"
        />
        <Field
          label="SKU"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          placeholder="MOOR-CT-OAT-M"
        />
        <Field
          label="초기 재고"
          type="number"
          inputMode="numeric"
          min={0}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
          className="tnum text-right"
        />
      </div>

      {error && (
        <p role="alert" className="text-[12px] text-accent">{error}</p>
      )}

      <div>
        <Button type="submit" size="md" variant="secondary" disabled={pending}>
          {pending ? '추가 중…' : '옵션 추가'}
        </Button>
      </div>
    </form>
  );
}
