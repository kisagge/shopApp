'use client';

import type { PaymentMethodInput } from '@shop/contract';
import type { MessageKey } from '@shop/i18n';
import { useRadioGroup } from '~/lib/a11y/use-radio-group';
import { useT } from '~/lib/i18n/client';

const METHOD_KEY: Record<PaymentMethodInput, MessageKey> = {
  CARD: 'payMethod.CARD',
  TRANSFER: 'payMethod.TRANSFER',
  VIRTUAL_ACCOUNT: 'payMethod.VIRTUAL_ACCOUNT',
  EASY_PAY: 'payMethod.EASY_PAY',
};

/**
 * 결제 수단.
 *
 * **목록이 아니라 라디오 그룹이다.** role 을 얹는 순간 ul 의 목록 의미가
 * 사라져서 그 안의 li 가 갈 곳을 잃는다 — 상품 옵션에서 같은 것을 고쳤는데
 * 여기 하나가 더 있었다. 훑기가 결제 화면을 지나가지 않아 그동안 몰랐다.
 *
 * role="radiogroup" 을 얹으면 낭독기는 네이티브 라디오처럼 다뤄지리라
 * 기대한다 — 탭으로 들어와 화살표로 고르는 것. 버튼만 나열해 두었더니
 * 화살표가 아무 일도 하지 않았고, 수단 넷이 모두 탭 순서에 있었다.
 */
export function PaymentMethods({
  methods,
  method,
  onSelect,
  realGateway,
}: {
  methods: readonly PaymentMethodInput[];
  method: PaymentMethodInput;
  onSelect: (m: PaymentMethodInput) => void;
  realGateway: boolean;
}) {
  const t = useT();
  const keys = useRadioGroup({
    items: methods.map((m) => ({ id: m })),
    checked: method,
    onSelect,
  });

  return (
    <section aria-labelledby="method-title">
      <h2 id="method-title" className="mb-3.5 text-sm font-semibold">{t('checkout.method')}</h2>
      <div
        role="radiogroup"
        aria-labelledby="method-title"
        className="grid grid-cols-2 gap-2"
        {...keys.groupProps}
      >
        {methods.map((m) => (
          <div key={m}>
            <button
              type="button"
              role="radio"
              aria-checked={method === m}
              {...keys.radioProps(m)}
              onClick={() => onSelect(m)}
              className={[
                'h-12 w-full rounded-sm border text-sm',
                method === m
                  ? 'border-n-900 bg-n-900 font-medium text-n-0'
                  : 'border-n-300 bg-[var(--bg)]',
              ].join(' ')}
            >
              {t(METHOD_KEY[m])}
            </button>
          </div>
        ))}
      </div>
      {/*
        무엇으로 도는지 사실대로 말한다. 결제창이 뜨지 않는데 주문이 완료되는
        것은 놀랄 일이므로 미리 알려야 하고, 반대로 실제 결제창이 뜰 때
        "연동이 안 됐다" 고 적혀 있으면 그것대로 사람을 헷갈리게 만든다.
      */}
      <p className="mt-3 rounded-sm bg-[var(--surface)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--fg-secondary)]">
        {realGateway ? t('checkout.tossOn') : t('checkout.tossOff')}
      </p>
    </section>
  );
}
