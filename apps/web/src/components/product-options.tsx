'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Price } from '@shop/ui';
import { RestockButton } from '~/components/restock-button';
import { track } from '~/lib/analytics/client';
import { useCartStore } from '~/stores/cart';
import { useRadioGroup } from '~/lib/a11y/use-radio-group';
import type { ProductDetail } from '~/lib/queries/catalog/products';
import { useT } from '~/lib/i18n/client';

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
  const t = useT();
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
        <OptionGroup
          key={group.id}
          group={group}
          picked={picked[group.id] ?? null}
          availability={availability}
          onPick={(valueId) => {
            setPicked((prev) => ({ ...prev, [group.id]: valueId }));
            setAdded(false);
          }}
        />
      ))}

      {selected && (
        <div className="flex items-center justify-between gap-4 rounded-sm border border-[var(--border)] bg-[var(--surface)] p-3.5">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-[var(--fg-secondary)]">{selected.label}</p>
            <Price amount={selected.price} size="sm" />
            {selected.stock > 0 && selected.stock <= 5 && (
              <p className="text-[11px] text-accent">{t('opt.stockLeft', { count: selected.stock })}</p>
            )}
          </div>
          <div className="flex items-center rounded-sm border border-n-300 bg-[var(--bg)]">
            <button
              type="button" aria-label={t('cart.decrease')}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="flex h-9 w-9 items-center justify-center text-[var(--fg-secondary)]"
            >
              −
            </button>
            <span aria-label={t('cart.quantityOf', { count: quantity })} className="tnum w-8 text-center text-sm font-semibold">
              {quantity}
            </span>
            <button
              type="button" aria-label={t('cart.increase')}
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
      {/*
        **좁으면 접는다.** 두 버튼은 글자보다 좁아지지 못한다(flex 항목의
        min-width 가 auto 다). 한국어에서는 둘이 320px 화면의 본문 288px 에
        들어갔지만, 일본어는 `カートに入れる` 와 `オプションを選択してください`
        가 나란히 서서 최소 폭이 346px 이 됐다 — 그만큼 **화면 전체가 가로로
        밀렸다.** 상품 상세만 그런 것이 아니라 페이지가 통째로 넘친다.

        비율을 없애는 대신 접히게 둔다. 들어갈 때는 지금 그대로 1 : 1.3 이고,
        안 들어가면 각자 한 줄을 차지한다. 글자를 줄이거나 자르지 않는다 —
        말이 길어지는 것은 번역의 정상적인 결과다.
      */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          className="flex-1"
          aria-disabled={!canAdd}
          /*
           * 옆의 구매하기는 못 누를 때 이름 자체가 '옵션을 선택하세요' 로
           * 바뀌는데 이쪽은 안 바뀌었다. 낭독기에는 "장바구니 담기, 사용
           * 불가" 만 들리고 왜인지는 어디에도 없었다. 이름은 그대로 두고
           * 이유만 덧붙인다 — 담는 버튼과 가는 버튼을 이름으로 구분해야
           * 하기 때문이다.
           */
          aria-describedby={canAdd ? undefined : 'add-blocked'}
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
          {/*
            헤더의 장바구니 링크와 이름이 같으면 낭독기로 훑을 때 어느 쪽이
            가는 것이고 어느 쪽이 담는 것인지 구분되지 않는다. 사전에는
            제대로 된 말이 이미 있었는데 쓰이지 않고 있었다.
          */}
          {t('product.addToCart')}
        </Button>
        <Button aria-disabled={!canAdd} className="flex-[1.3]">
          {canAdd ? t('product.buyNow') : t('opt.selectFirst')}
        </Button>
      </div>

      {!canAdd && (
        <p id="add-blocked" className="sr-only">
          {t('opt.selectFirst')}
        </p>
      )}

      {/* 담긴 결과를 시각적으로만 알리면 스크린리더 사용자가 모른다 */}
      <p role="status" aria-live="polite" className="text-center text-xs text-success">
        {added ? t('opt.added') : ''}
      </p>
      </>
      )}
    </div>
  );
}


/**
 * 옵션 한 묶음.
 *
 * **컴포넌트로 뺀 이유는 훅 때문이다.** 키보드 규칙은 묶음마다 자기 항목
 * 목록을 알아야 하는데, 그리는 자리가 map 안이라 거기서는 훅을 부를 수 없다.
 */
function OptionGroup({
  group,
  picked,
  availability,
  onPick,
}: {
  group: ProductDetail['optionGroups'][number];
  picked: string | null;
  availability: ReadonlyMap<string, boolean>;
  onPick: (valueId: string) => void;
}) {
  const t = useT();

  const { groupProps, radioProps } = useRadioGroup({
    items: group.values.map((v) => ({
      id: v.id,
      // 품절 사이즈는 보이되 화살표로 건너뛴다. 고를 수 없는 것에 멈춰 설 이유가 없다.
      disabled: !(availability.get(v.id) ?? false),
    })),
    checked: picked,
    onSelect: onPick,
  });

  return (
    <section aria-labelledby={`opt-${group.id}`}>
      <h2 id={`opt-${group.id}`} className="mb-2.5 text-[13px] font-semibold">
        {group.name}
      </h2>
      {/*
        목록이 아니라 라디오 그룹이다.
        전에는 <ul role="radiogroup"> 이었는데, role 을 얹는 순간 ul 의 목록
        의미가 사라져서 그 안의 li 가 **목록 없는 항목**이 된다. 낭독기에는
        "라디오 그룹" 과 "목록" 이 겹쳐 들리고, 검사는 li 가 갈 곳이 없다고
        말한다. 라디오 그룹은 애초에 목록이 아니므로 껍데기를 걷어냈다.
      */}
      <div
        role="radiogroup"
        aria-labelledby={`opt-${group.id}`}
        className="grid grid-cols-4 gap-2"
        {...groupProps}
      >
        {group.values.map((value) => {
          const on = picked === value.id;
          const available = availability.get(value.id) ?? false;
          return (
            <div key={value.id}>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-disabled={!available}
                {...radioProps(value.id)}
                onClick={() => {
                  if (!available) return;
                  onPick(value.id);
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
                <span className="mt-1 block text-center text-[10px] text-[var(--fg-muted)]">
                  {t('catalog.soldOut')}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
