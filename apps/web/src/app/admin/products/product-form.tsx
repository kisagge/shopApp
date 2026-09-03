'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { PRODUCT_STATUS, PRODUCT_STATUS_LABEL, type ProductStatusInput } from '@shop/contract';
import { discountRateOf, won } from '@shop/core';

export interface ProductFormOption {
  readonly id: string;
  readonly label: string;
}

export interface ProductFormValues {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly brandId: string;
  readonly categoryId: string;
  readonly listPrice: string;
  readonly salePrice: string;
  readonly status: ProductStatusInput;
}

interface Props {
  readonly mode: 'create' | 'edit';
  readonly productId?: string;
  readonly brands: readonly ProductFormOption[];
  readonly categories: readonly ProductFormOption[];
  readonly initial: ProductFormValues;
}

type FieldErrors = Readonly<Record<string, string>>;

const EMPTY: FieldErrors = {};

/**
 * 상품 등록·수정 폼.
 *
 * 서버가 돌려준 필드 에러를 그대로 각 입력 옆에 붙인다. 클라이언트에서
 * 한 번 더 검증하지 않는 이유는 **계약이 서버에 있기 때문**이다. 두 벌로
 * 두면 반드시 어긋난다.
 */
export function ProductForm({ mode, productId, brands, categories, initial }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(initial);
  const [errors, setErrors] = useState<FieldErrors>(EMPTY);
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const brandId = useId();
  const categoryId = useId();
  const statusId = useId();
  const descriptionId = useId();

  const list = Number(values.listPrice);
  const sale = values.salePrice === '' ? null : Number(values.salePrice);
  const rate =
    sale !== null && Number.isInteger(list) && Number.isInteger(sale) && sale > 0 && sale <= list
      ? discountRateOf(won(list), won(sale))
      : 0;

  function set<K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors(EMPTY);
    setFormError(null);

    const payload = {
      slug: values.slug,
      name: values.name,
      description: values.description,
      brandId: values.brandId,
      categoryId: values.categoryId,
      listPrice: Number(values.listPrice),
      salePrice: values.salePrice === '' ? null : Number(values.salePrice),
      status: values.status,
    };

    try {
      const response = await fetch(
        mode === 'create' ? '/api/admin/products' : `/api/admin/products/${productId}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const data: unknown = await response.json();

      if (!response.ok) {
        const body = data as {
          message?: string;
          fields?: readonly { path: string; message: string }[];
        };
        if (body.fields?.length) {
          setErrors(Object.fromEntries(body.fields.map((f) => [f.path, f.message])));
        }
        setFormError(body.message ?? '저장하지 못했습니다.');
        return;
      }

      const created = data as { id: string };
      router.push(`/admin/products/${mode === 'create' ? created.id : productId}`);
      router.refresh();
    } catch {
      setFormError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="flex flex-col gap-8">
      {formError && (
        // 폼 전체 에러는 제출 직후 읽혀야 한다
        <p
          role="alert"
          className="rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] text-accent"
        >
          {formError}
        </p>
      )}

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="pb-1 text-xs font-semibold tracking-wide text-[var(--fg-secondary)]">
          기본 정보
        </legend>

        <Field
          label="상품명"
          required
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          maxLength={120}
        />

        <Field
          label="슬러그"
          required
          value={values.slug}
          onChange={(e) => set('slug', e.target.value)}
          error={errors.slug}
          hint="주소에 그대로 들어갑니다. 영소문자·숫자·하이픈만."
          maxLength={80}
        />

        <div className="flex flex-col gap-2">
          <label htmlFor={descriptionId} className="text-xs font-medium text-[var(--fg-secondary)]">
            상품 설명
          </label>
          <textarea
            id={descriptionId}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            rows={4}
            maxLength={4000}
            className="rounded-sm border border-n-300 bg-[var(--bg)] px-3.5 py-3 text-sm text-[var(--fg)]"
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <label htmlFor={brandId} className="text-xs font-medium text-[var(--fg-secondary)]">
              브랜드
              <span className="ml-1 text-accent" aria-hidden="true">*</span>
              <span className="sr-only"> (필수)</span>
            </label>
            <select
              id={brandId}
              required
              value={values.brandId}
              onChange={(e) => set('brandId', e.target.value)}
              aria-invalid={errors.brandId ? true : undefined}
              className="h-12 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm text-[var(--fg)]"
            >
              <option value="">선택하세요</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor={categoryId} className="text-xs font-medium text-[var(--fg-secondary)]">
              카테고리
              <span className="ml-1 text-accent" aria-hidden="true">*</span>
              <span className="sr-only"> (필수)</span>
            </label>
            <select
              id={categoryId}
              required
              value={values.categoryId}
              onChange={(e) => set('categoryId', e.target.value)}
              className="h-12 rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm text-[var(--fg)]"
            >
              <option value="">선택하세요</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="pb-1 text-xs font-semibold tracking-wide text-[var(--fg-secondary)]">
          가격과 노출
        </legend>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="정가 (원)"
            required
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={values.listPrice}
            onChange={(e) => set('listPrice', e.target.value)}
            error={errors.listPrice}
            className="tnum"
          />
          <Field
            label="판매가 (원)"
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={values.salePrice}
            onChange={(e) => set('salePrice', e.target.value)}
            error={errors.salePrice}
            hint={rate > 0 ? `${rate}% 할인으로 표시됩니다` : '비워 두면 정가로 판매합니다'}
            className="tnum"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={statusId} className="text-xs font-medium text-[var(--fg-secondary)]">
            판매 상태
          </label>
          <select
            id={statusId}
            value={values.status}
            onChange={(e) => set('status', e.target.value as ProductStatusInput)}
            className="h-12 w-full rounded-sm border border-n-300 bg-[var(--bg)] px-3 text-sm text-[var(--fg)] sm:w-56"
          >
            {PRODUCT_STATUS.map((s) => (
              <option key={s} value={s}>{PRODUCT_STATUS_LABEL[s]}</option>
            ))}
          </select>
        </div>
      </fieldset>

      <div className="flex gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? '저장 중…' : mode === 'create' ? '상품 등록' : '변경 사항 저장'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          취소
        </Button>
      </div>
    </form>
  );
}
