'use client';

import { useState, type FormEvent } from 'react';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { Button, Field } from '@shop/ui';
import { generateCouponCode, COUPON_KIND_LABEL } from '@shop/core';
import type { CouponRow, NamedOption, Target } from './types';

/** 'YYYY-MM-DDTHH:mm' (datetime-local) 을 KST 로 해석해 ISO 로 */
const toIso = (value: string) => new Date(`${value}:00+09:00`).toISOString();

/**
 * 새 쿠폰.
 *
 * **자기 상태만 들고 있다.** 만드는 동안의 입력값·검증 오류·대상 목록은
 * 목록 쪽에서 볼 일이 없고, 취소하면 통째로 버려진다 — 화면을 닫으면
 * 상태도 함께 사라지는 편이 남겨 두는 것보다 정확하다.
 *
 * 오류 문구만 위로 올린다. 화면 맨 위 한 자리에서 읽히는 편이 낫다.
 */
export function CouponForm({
  brands, categories, canCancel, onCreated, onError, onCancel,
}: {
  brands: readonly NamedOption[];
  categories: readonly NamedOption[];
  canCancel: boolean;
  onCreated: (coupon: CouponRow) => void;
  onError: (message: string | null) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<'AMOUNT' | 'PERCENT'>('AMOUNT');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  /**
   * 쿠폰이 붙을 대상.
   *
   * 비워 두면 장바구니 전체다. 지정하면 그 줄에만 붙고 **최소 주문 금액도
   * 그 줄들의 합계로 잰다** — 5,000원짜리 티셔츠 전용 쿠폰을 다른 상품으로
   * 기준을 채워 쓰는 일이 없어야 한다.
   */
  const [targets, setTargets] = useState<Target[]>([]);
  /*
   * 대상을 빼면 그 칩과 버튼이 함께 사라진다. 챙기지 않으면 초점이 body 로
   * 떨어져, 여럿을 정리할 때마다 탭으로 처음부터 다시 내려와야 한다.
   */
  const { listRef, rememberRemoval } = useRemovalFocus(targets.length);
  const [productQuery, setProductQuery] = useState('');
  const [productHits, setProductHits] = useState<NamedOption[]>([]);
  const [searching, setSearching] = useState(false);

  const has = (t: Target) =>
    targets.some((x) => x.targetType === t.targetType && x.targetId === t.targetId);
  const toggleTarget = (t: Target) =>
    setTargets((list) =>
      has(t)
        ? list.filter((x) => !(x.targetType === t.targetType && x.targetId === t.targetId))
        : [...list, t],
    );

  const nameOf = (t: Target) => {
    if (t.targetType === 'BRAND') return brands.find((b) => b.id === t.targetId)?.name ?? t.targetId;
    if (t.targetType === 'CATEGORY') {
      return categories.find((c) => c.id === t.targetId)?.name ?? t.targetId;
    }
    return productHits.find((p) => p.id === t.targetId)?.name ?? t.targetId;
  };

  async function searchProducts() {
    const q = productQuery.trim();
    if (!q) return;
    setSearching(true);
    try {
      const response = await fetch(`/api/admin/products/search?q=${encodeURIComponent(q)}`);
      if (!response.ok) return;
      const data = (await response.json()) as { products: NamedOption[] };
      setProductHits(data.products);
    } finally {
      setSearching(false);
    }
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    onError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const text = (key: string) => {
      const v = data.get(key);
      return typeof v === 'string' ? v.trim() : '';
    };
    const num = (key: string) => Number(text(key) || 0);

    const body = {
      code: text('code'),
      name: text('name'),
      kind,
      value: kind === 'AMOUNT' ? num('value') : 0,
      percent: kind === 'PERCENT' ? num('percent') : 0,
      maxDiscount: kind === 'PERCENT' && text('maxDiscount') ? num('maxDiscount') : null,
      minimumOrder: num('minimumOrder'),
      issueLimit: text('issueLimit') ? num('issueLimit') : null,
      startsAt: toIso(text('startsAt')),
      endsAt: toIso(text('endsAt')),
      targets,
    };

    try {
      const response = await fetch('/api/admin/coupons', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        coupon?: CouponRow;
        message?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok || !result.coupon) {
        onError(result.message ?? '쿠폰을 만들지 못했습니다.');
        setFieldErrors(result.fields ?? {});
        return;
      }
      setCode('');
      setTargets([]);
      setProductHits([]);
      setProductQuery('');
      onCreated(result.coupon);
    } catch {
      onError('네트워크 오류로 만들지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => onCreate(e)}
      className="flex flex-col gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-6"
    >
      <h2 className="text-base font-semibold">새 쿠폰</h2>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex items-end gap-2">
          <Field
            label="코드"
            name="code"
            required
            maxLength={20}
            placeholder="WELCOME10"
            className="w-[200px] uppercase"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            error={fieldErrors['code']}
          />
          <Button type="button" variant="secondary" onClick={() => setCode(generateCouponCode())}>
            생성
          </Button>
        </div>
        <Field label="쿠폰 이름" name="name" required maxLength={60} error={fieldErrors['name']} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-xs font-medium text-[var(--fg-secondary)]">할인 방식</legend>
        <div className="flex gap-2">
          {(['AMOUNT', 'PERCENT'] as const).map((k) => (
            <label
              key={k}
              className="flex cursor-pointer items-center gap-2 rounded-sm border border-[var(--border)] px-3.5 py-2.5 text-[13px] has-[:checked]:border-[var(--brand)]"
            >
              <input
                type="radio"
                name="kind"
                value={k}
                checked={kind === k}
                onChange={() => setKind(k)}
                className="accent-[var(--brand)]"
              />
              {COUPON_KIND_LABEL[k]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-3">
        {kind === 'AMOUNT' ? (
          <Field
            label="할인 금액 (원)"
            name="value"
            required
            inputMode="numeric"
            error={fieldErrors['value']}
          />
        ) : (
          <>
            <Field
              label="할인율 (%)"
              name="percent"
              required
              inputMode="numeric"
              error={fieldErrors['percent']}
            />
            <Field
              label="할인 상한 (원)"
              name="maxDiscount"
              inputMode="numeric"
              hint="비우면 상한 없음"
              error={fieldErrors['maxDiscount']}
            />
          </>
        )}
        <Field
          label="최소 주문 금액 (원)"
          name="minimumOrder"
          inputMode="numeric"
          defaultValue="0"
          error={fieldErrors['minimumOrder']}
        />
        <Field
          label="발급 수량"
          name="issueLimit"
          inputMode="numeric"
          hint="비우면 무제한"
          error={fieldErrors['issueLimit']}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-sm border border-[var(--border)] p-4">
        <legend className="px-1 text-xs font-medium text-[var(--fg-secondary)]">
          사용 대상
        </legend>
        <p className="text-[12px] leading-relaxed text-[var(--fg-muted)]">
          아무것도 고르지 않으면 <b>모든 상품</b>에 쓸 수 있습니다. 고르면 그 상품 줄에만
          할인이 붙고, <b>최소 주문 금액도 그 줄들의 합계로 잽니다</b> — 대상이 아닌 상품으로
          기준을 채울 수 없습니다.
        </p>

        {targets.length > 0 && (
          <ul ref={listRef as React.RefObject<HTMLUListElement>} className="flex flex-wrap gap-1.5">
            {targets.map((t, index) => (
              <li key={`${t.targetType}-${t.targetId}`}>
                <button
                  type="button"
                  data-remove-row=""
                  onClick={() => {
                    // 빼는 순간 이 버튼도 사라진다. 어느 자리였는지 먼저 기억한다.
                    rememberRemoval(index);
                    toggleTarget(t);
                  }}
                  aria-label={`${nameOf(t)} 대상에서 빼기`}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-1 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
                >
                  {nameOf(t)}
                  <span aria-hidden="true" className="text-[var(--fg-muted)]">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--fg-muted)]">브랜드</span>
            <div className="flex flex-wrap gap-1.5">
              {brands.map((b) => (
                <label
                  key={b.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[var(--border)] px-2.5 py-1.5 text-[12px] has-[:checked]:border-[var(--brand)]"
                >
                  <input
                    type="checkbox"
                    checked={has({ targetType: 'BRAND', targetId: b.id })}
                    onChange={() => toggleTarget({ targetType: 'BRAND', targetId: b.id })}
                    className="accent-[var(--brand)]"
                  />
                  {b.name}
                </label>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] font-medium text-[var(--fg-muted)]">카테고리</span>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <label
                  key={c.id}
                  className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[var(--border)] px-2.5 py-1.5 text-[12px] has-[:checked]:border-[var(--brand)]"
                >
                  <input
                    type="checkbox"
                    checked={has({ targetType: 'CATEGORY', targetId: c.id })}
                    onChange={() => toggleTarget({ targetType: 'CATEGORY', targetId: c.id })}
                    className="accent-[var(--brand)]"
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium text-[var(--fg-muted)]">개별 상품</span>
          <div className="flex items-center gap-2">
            {/*
              상품은 많아서 목록으로 못 편다. 찾아서 고른다.
              이 폼 안에 또 form 을 둘 수 없으므로(중첩 form 은 HTML 이
              허용하지 않는다) Enter 는 직접 처리한다.
            */}
            <label htmlFor="product-q" className="sr-only">상품 검색</label>
            <input
              id="product-q"
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void searchProducts();
                }
              }}
              placeholder="상품명으로 검색"
              className="h-10 w-[240px] rounded-sm border border-[var(--border)] bg-[var(--bg)] px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--ring)]"
            />
            <Button type="button" variant="secondary" size="md" onClick={() => searchProducts()}>
              {searching ? '찾는 중…' : '검색'}
            </Button>
          </div>
          {productHits.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {productHits.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-1.5 rounded-sm border border-[var(--border)] px-2.5 py-1.5 text-[12px] has-[:checked]:border-[var(--brand)]">
                    <input
                      type="checkbox"
                      checked={has({ targetType: 'PRODUCT', targetId: p.id })}
                      onChange={() => toggleTarget({ targetType: 'PRODUCT', targetId: p.id })}
                      className="accent-[var(--brand)]"
                    />
                    {p.name}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </fieldset>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="시작" name="startsAt" type="datetime-local" required error={fieldErrors['startsAt']} />
        <Field label="종료" name="endsAt" type="datetime-local" required error={fieldErrors['endsAt']} />
      </div>

      <p className="text-[12px] leading-relaxed text-[var(--fg-muted)]">
        할인 내용은 <b>한 장이라도 발급되면 고칠 수 없습니다.</b> 받은 사람은 그때 조건으로
        쓸 수 있다고 믿고 있기 때문입니다. 바꿔야 하면 중지하고 새로 만들어 주세요.
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? '만드는 중…' : '쿠폰 만들기'}
        </Button>
        {canCancel && (
          <Button type="button" variant="secondary" onClick={onCancel}>
            취소
          </Button>
        )}
      </div>
    </form>
  );
}
