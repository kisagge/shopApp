'use client';

import { useId } from 'react';
import type { CartCouponOffer } from '@shop/contract';
import { useT } from '~/lib/i18n/client';

/**
 * 쿠폰 고르기.
 *
 * **쿠폰을 받을 수는 있는데 쓸 수가 없었다.** 서버는 코드를 받으면 할인을
 * 계산할 줄 알았지만 어느 화면도 코드를 보내지 않았고, 쿠폰함은 받아 두기만
 * 하는 자리였다.
 *
 * **코드를 외우게 하지 않는다.** 가진 쿠폰을 늘어놓고 각각 이 장바구니에서
 * 얼마가 깎이는지 함께 적는다 — 정률은 상한이, 정액은 최소 주문 금액이,
 * 어떤 것은 대상 상품이 걸려서 눈으로는 알 수 없다. 그 계산은 견적이 한다.
 *
 * **못 쓰는 것도 남겨 둔다.** 목록에서 빼면 "내 쿠폰이 어디 갔지" 가 되고,
 * 조금 더 담으면 쓸 수 있다는 사실도 함께 사라진다. 대신 고를 수 없게 잠근다.
 *
 * 라디오다. 하나만 쓸 수 있고, 지금 무엇이 붙어 있는지 눌러 보지 않아도
 * 보여야 한다 — 그건 버튼이 아니라 라디오가 하는 일이다.
 */
export function CouponPicker({
  offers,
  selected,
  autoPicked,
  onSelect,
  money,
}: {
  offers: readonly CartCouponOffer[];
  /** 지금 붙어 있는 쿠폰 코드. 안 쓰면 null */
  selected: string | null;
  /** 사람이 고른 것이 아니라 우리가 골라 붙였는가 */
  autoPicked: boolean;
  onSelect: (code: string | null) => void;
  money: (amount: number) => string;
}) {
  const t = useT();
  const name = useId();

  // 가진 쿠폰이 없으면 자리를 만들지 않는다. 빈 상자는 화면만 길어진다.
  if (offers.length === 0) return null;

  const usable = offers.filter((o) => o.discount > 0).length;

  return (
    <fieldset className="flex flex-col gap-2 border-t border-[var(--border)] pt-5">
      <legend className="mb-1.5 text-sm font-medium">
        {t('coupon.pickHeading', { count: usable })}
      </legend>

      {/*
        **우리가 골랐다는 사실을 말한다.** 말하지 않으면 쿠폰이 저절로 붙은
        것처럼 보이고, 사람은 자기가 무엇을 눌렀는지 되짚게 된다.
      */}
      {autoPicked && (
        <p className="mb-1 text-xs text-[var(--fg-muted)]">{t('coupon.pickBest')}</p>
      )}

      <label className="flex items-center gap-2 text-[13px] text-[var(--fg-secondary)]">
        <input
          type="radio"
          name={name}
          className="size-4 accent-[var(--brand)]"
          checked={selected === null}
          onChange={() => onSelect(null)}
        />
        {t('coupon.pickNone')}
      </label>

      {offers.map((offer) => {
        const disabled = offer.discount === 0;
        return (
          <label
            key={offer.code}
            className={`flex items-center gap-2 text-[13px] ${
              disabled ? 'cursor-not-allowed text-[var(--fg-muted)]' : 'text-[var(--fg)]'
            }`}
          >
            <input
              type="radio"
              name={name}
              className="size-4 accent-[var(--brand)]"
              checked={selected === offer.code}
              disabled={disabled}
              onChange={() => onSelect(offer.code)}
            />
            <span className="flex-1">{offer.name}</span>
            {/* 얼마가 깎이는지가 고르는 이유다. 이름만으로는 알 수 없다. */}
            <span className="tnum shrink-0 font-medium">
              {disabled ? t('coupon.pickUnusable') : `-${money(offer.discount)}`}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
