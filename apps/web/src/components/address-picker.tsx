'use client';

import { useEffect, useState } from 'react';
import { Badge, Button } from '@shop/ui';
import { AddressForm, type SavedAddress } from '~/components/address-form';
import { formatMoney } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';

/**
 * 저장된 배송지 중에서 고르거나 새로 추가한다.
 *
 * 라디오로 만든다. 여러 개 중 하나를 고르는 일이고, 키보드 화살표로 옮겨
 * 다닐 수 있어야 한다. 버튼 목록으로 만들면 그 동작이 사라진다.
 */
export function AddressPicker({
  currentId,
  onPicked,
  onCancel,
  remoteSurcharge,
}: {
  currentId: string | null;
  onPicked: (address: SavedAddress) => void;
  onCancel: () => void;
  /**
   * 제주·도서산간 추가 배송비. **서버가 읽어 내려보낸다.**
   *
   * 예전에는 이 컴포넌트가 `DEFAULT_SHIPPING` 상수를 직접 읽었다. 그 값이
   * 운영 데이터가 된 뒤로는, 상수를 읽으면 **운영이 바꾼 값과 화면에 적힌
   * 값이 갈린다** — 결제는 4,000원을 받는데 안내는 3,000원이라고 말하는
   * 상태이고, 그건 고객이 결제 직전에 발견한다.
   */
  remoteSurcharge: number;
}) {
  const t = useT();
  const locale = useLocale();
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null);
  const [selected, setSelected] = useState(currentId);
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const response = await fetch('/api/addresses');
        if (!response.ok) throw new Error();
        const data = (await response.json()) as { addresses: SavedAddress[] };
        if (!alive) return;
        setAddresses(data.addresses);
        // 저장된 것이 없으면 곧장 입력 화면으로. 빈 목록만 보여 주면
        // 또 한 번 눌러야 하고, 그 사이 무엇을 해야 할지 모른다.
        if (data.addresses.length === 0) setAdding(true);
      } catch {
        if (alive) setError(t('addr.loadFailed'));
      }
    })();
    return () => {
      alive = false;
    };
    // t 는 언어가 바뀔 때만 새로 만들어지고, 언어를 바꾸면 화면이 통째로
    // 다시 뜬다. 다시 부를 일이 실제로는 없다.
  }, [t]);

  async function apply() {
    const target = addresses?.find((a) => a.id === selected);
    if (!target) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/addresses/${target.id}`, { method: 'PATCH' });
      if (!response.ok) {
        setError(t('addr.changeFailed'));
        return;
      }
      onPicked(target);
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  if (adding) {
    return (
      <AddressForm
        remoteSurcharge={remoteSurcharge}
        onSaved={onPicked}
        submitLabel={t('addr.use')}
        onCancel={
          addresses && addresses.length > 0 ? () => setAdding(false) : onCancel
        }
      />
    );
  }

  if (addresses === null) {
    return <p className="py-6 text-center text-[13px] text-[var(--fg-muted)]">{t('common.loading')}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-medium text-[var(--fg-secondary)]">
          {t('addr.pick')}
        </legend>
        {addresses.map((a) => (
          <label
            key={a.id}
            className="flex cursor-pointer items-start gap-3 rounded-sm border border-[var(--border)] p-3.5 has-[:checked]:border-[var(--brand)]"
          >
            <input
              type="radio"
              name="addressId"
              value={a.id}
              checked={selected === a.id}
              onChange={() => setSelected(a.id)}
              className="mt-1 accent-[var(--brand)]"
            />
            <span className="flex flex-col gap-1">
              <span className="flex items-center gap-2 text-sm font-medium">
                {a.recipient}
                {a.label && <Badge tone="neutral">{a.label}</Badge>}
                {a.isDefault && <Badge tone="neutral">{t('addr.default')}</Badge>}
              </span>
              <span className="tnum text-[13px] text-[var(--fg-secondary)]">{a.phone}</span>
              <span className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
                {a.address1} {a.address2}{' '}
                <span className="tnum text-[var(--fg-muted)]">({a.postalCode})</span>
              </span>
              {a.isRemoteArea && (
                <span className="text-[12px] text-[var(--fg-muted)]">
                  {t('addr.remoteFee', {
                    fee: formatMoney(locale, remoteSurcharge),
                  })}
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => apply()} disabled={pending || selected === null}>
          {pending ? t('addr.changing') : t('addr.use')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          {t('addr.addNew')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}
