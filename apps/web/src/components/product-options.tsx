'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Price } from '@shop/ui';
import { RestockButton } from '~/components/restock-button';
import { track } from '~/lib/analytics/client';
import { useCartStore } from '~/stores/cart';
import type { ProductDetail } from '~/lib/queries/products';

/**
 * 옵션 선택과 장바구니 담기.
 *
 * 변형(variant)은 옵션 값들의 조합이다. 사용자가 그룹마다 하나씩 고르면
 * 그 조합에 해당하는 변형을 찾는다. **재고는 변형 단위**라, 색을 고른
 * 순간 어떤 사이즈가 품절인지 달라진다 — 그걸 반영해 버튼을 비활성화한다.
 */
export function ProductOptions({
  product,
  loggedIn,
  restockOn,
}: {
  product: ProductDetail;
  loggedIn: boolean;
  /** 이미 재입고 알림을 걸어 둔 옵션 id 들 */
  restockOn: readonly string[];
}) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const add = useCartStore((s) => s.add);

  useEffect(() => {
    track('view_item', { productId: product.id });
  }, [product.id]);

  const selected = useMemo(() => {
    const ids = Object.values(picked);
    if (ids.length !== product.optionGroups.length) return null;
    return (
      product.variants.find(
        (v) => ids.every((id) => v.optionValueIds.includes(id)),
      ) ?? null
    );
  }, [picked, product]);

  /** 어떤 옵션 값이 고를 수 있는가 — 이미 고른 다른 그룹의 값과 조합해 재고를 본다 */
  const availability = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const group of product.optionGroups) {
      const others = Object.entries(picked)
        .filter(([g]) => g !== group.id)
        .map(([, id]) => id);
      for (const value of group.values) {
        const candidates = product.variants.filter(
          (v) => v.optionValueIds.includes(value.id) && others.every((id) => v.optionValueIds.includes(id)),
        );
        map.set(value.id, candidates.some((v) => v.stock > 0));
      }
    }
    return map;
  }, [picked, product]);

  const canAdd = selected !== null && selected.stock > 0;

  return (
    <div className="flex flex-col gap-6">
      {product.optionGroups.map((group) => (
        <section key={group.id} aria-labelledby={`opt-${group.id}`}>
          <h2 id={`opt-${group.id}`} className="mb-2.5 text-[13px] font-semibold">
            {group.name}
          </h2>
          <ul role="radiogroup" aria-labelledby={`opt-${group.id}`} className="grid grid-cols-4 gap-2">
            {group.values.map((value) => {
              const on = picked[group.id] === value.id;
              const available = availability.get(value.id) ?? false;
              return (
                <li key={value.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    aria-disabled={!available}
                    onClick={() => {
                      if (!available) return;
                      setPicked((prev) => ({ ...prev, [group.id]: value.id }));
                      setAdded(false);
                    }}
                    className={[
                      'h-12 w-full rounded-sm border text-sm',
                      !available
                        ? 'border-n-100 bg-[var(--surface)] text-n-400 line-through'
                        : on
                          ? 'border-n-900 bg-n-900 font-semibold text-n-0'
                          : 'border-n-300 bg-[var(--bg)] text-[var(--fg)]',
                    ].join(' ')}
                  >
                    {value.value}
                  </button>
                  {!available && (
                    <span className="mt-1 block text-center text-[10px] text-[var(--fg-muted)]">품절</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {selected && (
        <div className="flex items-center justify-between gap-4 rounded-sm border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[var(--fg-secondary)]">{selected.label}</p>
            <Price amount={selected.price} size="sm" />
            {selected.stock > 0 && selected.stock <= 5 && (
              <p className="text-[11px] text-accent">{selected.stock}개 남음</p>
            )}
          </div>
          <div className="flex items-center rounded-sm border border-n-300 bg-[var(--bg)]">
            <button
              type="button" aria-label="수량 줄이기"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center text-[var(--fg-secondary)]"
            >
              −
            </button>
            <span aria-label={`수량 ${quantity}개`} className="tnum w-8 text-center text-sm font-semibold">
              {quantity}
            </span>
            <button
              type="button" aria-label="수량 늘리기"
              onClick={() => setQuantity((q) => Math.min(selected.stock, q + 1))}
              className="flex h-9 w-9 items-center justify-center"
            >
              ＋
            </button>
          </div>
        </div>
      )}

      {/*
        품절된 옵션을 고르면 담기 대신 재입고 알림을 준다.
        살 수 없는 화면에서 할 수 있는 일이 아무것도 없으면 그냥 떠난다.
      */}
      {selected && selected.stock <= 0 ? (
        <RestockButton
          variantId={selected.id}
          optionLabel={selected.label}
          subscribed={restockOn.includes(selected.id)}
          loggedIn={loggedIn}
        />
      ) : (
      <>
      {/* flex 행 안에서는 block(w-full) 을 쓰지 않는다. 두 버튼이 모두
          100% 너비를 요구하면 비율(flex-[1.3])이 눌려 글자가 잘린다. */}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          aria-disabled={!canAdd}
          onClick={() => {
            if (!canAdd || !selected) return;
            add(
              {
                variantId: selected.id,
                productId: product.id,
                productName: product.name,
                brand: product.brand,
                optionLabel: selected.label,
                listPrice: product.listPrice,
                // 금액은 서버(/api/cart/quote)가 다시 계산한다. 여기 값은 화면 표시용이다.
                salePrice: selected.price,
              },
              quantity,
            );
            track('add_to_cart', {
              productId: product.id,
              variantId: selected.id,
              quantity,
            });
            setAdded(true);
          }}
        >
          장바구니
        </Button>
        <Button aria-disabled={!canAdd} className="flex-[1.3]">
          {canAdd ? '바로 구매' : '옵션을 선택하세요'}
        </Button>
      </div>

      {/* 담긴 결과를 시각적으로만 알리면 스크린리더 사용자가 모른다 */}
      <p role="status" aria-live="polite" className="text-center text-xs text-success">
        {added ? '장바구니에 담았습니다' : ''}
      </p>
      </>
      )}
    </div>
  );
}
