'use client';

import { useId, useState } from 'react';
import { Button } from '@shop/ui';
import type { CartOptionsResponse } from '@shop/contract';
import { useCartStore, type CartItem } from '~/stores/cart';
import { useT } from '~/lib/i18n/client';

/**
 * 장바구니 한 줄의 **옵션 바꾸기.**
 *
 * "L 이 품절입니다" 라고만 하고 바꿀 길이 없었다 — 같은 상품의 M 을 사려면 상품 화면으로
 * 돌아가 다시 담고, 여기 와서 L 을 지워야 했다.
 *
 * **여는 순간 옵션을 읽는다.** 장바구니를 열 때 모든 줄의 옵션을 미리 읽으면, 대부분 한
 * 번도 안 여는 칸 때문에 줄 수만큼 요청이 나간다. 읽은 목록은 매대 캐시를 거치지 않아
 * 재고가 지금 값이다.
 *
 * **고르는 칸은 평범한 select 다.** 상품 화면처럼 색·사이즈를 따로 고르게 하면 둘을 다
 * 골라야 조합이 정해지는데, 여기서 할 일은 "이 줄을 다른 옵션으로" 하나다. 품절인 옵션도
 * 목록에 남기되 고르지 못하게 한다 — 빼면 "L 은 어디 갔지" 가 된다.
 *
 * **바꾸면 줄이 새로 그려진다**(줄의 열쇠가 옵션이다). 그대로 두면 초점이 문서 맨 앞으로
 * 떨어지니, 새 줄의 같은 단추로 옮기고 무엇으로 바꿨는지 말한다.
 */
export function CartOptionChange({
  item, prominent, onChanged,
}: {
  item: CartItem;
  /** 이 줄을 지금 살 수 없다 — 바꾸기가 할 수 있는 일의 첫째다 */
  prominent: boolean;
  onChanged: (message: string) => void;
}) {
  const t = useT();
  const swapVariant = useCartStore((s) => s.swapVariant);
  const panelId = useId();
  const selectId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'loading' }
    | { kind: 'error' }
    | { kind: 'ready'; data: CartOptionsResponse }
  >({ kind: 'idle' });
  const [picked, setPicked] = useState(item.variantId);

  async function openPanel() {
    setOpen(true);
    setPicked(item.variantId);
    setState({ kind: 'loading' });
    try {
      const response = await fetch(`/api/cart/options?variantId=${encodeURIComponent(item.variantId)}`);
      if (!response.ok) {
        setState({ kind: 'error' });
        return;
      }
      setState({ kind: 'ready', data: (await response.json()) as CartOptionsResponse });
    } catch {
      setState({ kind: 'error' });
    }
  }

  function apply(data: CartOptionsResponse) {
    const option = data.options.find((o) => o.variantId === picked);
    if (!option || option.variantId === item.variantId || !option.available) return;

    swapVariant(item.variantId, {
      variantId: option.variantId,
      productId: data.productId,
      productName: data.productName,
      brand: data.brandName,
      optionLabel: option.label,
      listPrice: data.listPrice,
      salePrice: option.unitPrice,
      imageUrl: data.imageUrl,
      blurDataUrl: data.blurDataUrl,
    });
    onChanged(t('cart.optionChanged', { name: data.productName, option: option.label }));
    // 줄이 새 열쇠로 다시 그려진 뒤에 초점을 옮긴다
    requestAnimationFrame(() => {
      document.getElementById(optionButtonId(option.variantId))?.focus();
    });
  }

  const others = state.kind === 'ready'
    ? state.data.options.filter((o) => o.variantId !== item.variantId)
    : [];
  const canApply = state.kind === 'ready'
    && picked !== item.variantId
    && others.some((o) => o.variantId === picked && o.available);

  return (
    <div className="flex flex-col gap-2">
      <Button
        id={optionButtonId(item.variantId)}
        type="button"
        size="sm"
        variant={prominent ? 'secondary' : 'ghost'}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={t('cart.changeOptionOf', { name: item.productName })}
        onClick={() => (open ? setOpen(false) : void openPanel())}
        className="w-fit"
      >
        {t('cart.changeOption')}
      </Button>

      <div id={panelId} hidden={!open} className="flex flex-col gap-2 rounded-sm border border-[var(--border)] p-3">
        {state.kind === 'loading' && (
          <p role="status" className="text-xs text-[var(--fg-muted)]">{t('cart.optionLoading')}</p>
        )}
        {state.kind === 'error' && (
          <p role="alert" className="text-xs text-accent">{t('cart.optionLoadFailed')}</p>
        )}
        {state.kind === 'ready' && others.length === 0 && (
          <p className="text-xs text-[var(--fg-muted)]">{t('cart.optionNone')}</p>
        )}
        {state.kind === 'ready' && others.length > 0 && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              apply(state.data);
            }}
            className="flex flex-wrap items-end gap-2"
          >
            <div className="flex min-w-[10rem] flex-1 flex-col gap-1">
              <label htmlFor={selectId} className="text-[11px] text-[var(--fg-secondary)]">
                {t('cart.optionPick')}
              </label>
              <select
                id={selectId}
                value={picked}
                onChange={(e) => setPicked(e.target.value)}
                className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[13px]"
              >
                {state.data.options.map((o) => (
                  <option
                    key={o.variantId}
                    value={o.variantId}
                    // 지금 옵션은 보여 주되 고를 대상은 아니다. 품절은 고르지 못한다
                    disabled={o.variantId !== item.variantId && !o.available}
                  >
                    {o.variantId === item.variantId
                      ? t('cart.optionCurrent', { option: o.label })
                      : o.available ? o.label : t('cart.optionSoldOut', { option: o.label })}
                  </option>
                ))}
              </select>
            </div>
            <Button type="submit" size="sm" disabled={!canApply}>{t('cart.optionApply')}</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t('cart.optionClose')}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

const optionButtonId = (variantId: string) => `cart-option-${variantId}`;
