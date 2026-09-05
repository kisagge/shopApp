'use client';

import { useState } from 'react';
import { Badge, Button } from '@shop/ui';
import { MAX_ADDRESSES } from '@shop/core';
import { AddressForm, type SavedAddress } from '~/components/address-form';
import { formatMoney } from '@shop/i18n';
import { useLocale, useT } from '~/lib/i18n/client';
import { DEFAULT_SHIPPING } from '@shop/core';

/**
 * 배송지 목록.
 *
 * 주문 화면의 선택기와 달리 여기서는 **지우기와 기본 지정**을 한다.
 * 주문 도중에 배송지를 지울 일은 없고, 그 자리에 삭제 버튼을 두면
 * 고르려다 지우는 사고가 난다.
 */
export function AddressBook({ initial }: { initial: readonly SavedAddress[] }) {
  const t = useT();
  const locale = useLocale();
  const [addresses, setAddresses] = useState<readonly SavedAddress[]>(initial);
  const [adding, setAdding] = useState(initial.length === 0);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 스크린리더에 결과를 알린다. 목록만 바뀌면 무슨 일이 일어났는지 모른다. */
  const [status, setStatus] = useState('');

  async function makeDefault(target: SavedAddress) {
    setBusy(target.id);
    setError(null);
    try {
      const response = await fetch(`/api/addresses/${target.id}`, { method: 'PATCH' });
      if (!response.ok) {
        setError(t('addr.defaultFailed'));
        return;
      }
      setAddresses((list) =>
        list
          .map((a) => ({ ...a, isDefault: a.id === target.id }))
          // 기본이 맨 위로 올라오는 정렬은 서버와 같게 유지한다
          .sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
      );
      setStatus(t('addr.setDefaultDone', { name: target.recipient }));
    } catch {
      setError(t('common.networkError'));
    } finally {
      setBusy(null);
    }
  }

  async function remove(target: SavedAddress) {
    setBusy(target.id);
    setError(null);
    try {
      const response = await fetch(`/api/addresses/${target.id}`, { method: 'DELETE' });
      if (!response.ok) {
        setError(t('addr.deleteFailed'));
        return;
      }
      const rest = addresses.filter((a) => a.id !== target.id);
      // 기본을 지우면 서버가 남은 것 중 하나를 기본으로 올린다. 화면도 맞춘다.
      if (target.isDefault && rest[0]) rest[0] = { ...rest[0], isDefault: true };
      setAddresses(rest);
      setStatus(t('addr.deleted'));
      if (rest.length === 0) setAdding(true);
    } catch {
      setError(t('common.networkError'));
    } finally {
      setBusy(null);
    }
  }

  const full = addresses.length >= MAX_ADDRESSES;

  return (
    <div className="flex flex-col gap-6">
      {/*
        결과를 소리로도 알린다. 목록에서 한 줄이 사라지는 것은 눈으로만
        보이는 변화라, 이것이 없으면 눌렀는데 아무 일도 안 난 것처럼 느낀다.
      */}
      <p aria-live="polite" className="sr-only">
        {status}
      </p>
      {error && (
        <p role="alert" className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent">
          {error}
        </p>
      )}

      {addresses.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {addresses.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-sm border border-[var(--border)] p-4"
            >
              <div className="flex flex-col gap-1">
                <p className="flex items-center gap-2 text-sm font-medium">
                  {a.recipient}
                  {a.label && <Badge tone="neutral">{a.label}</Badge>}
                  {a.isDefault && <Badge tone="neutral">{t('addr.default')}</Badge>}
                </p>
                <p className="tnum text-[13px] text-[var(--fg-secondary)]">{a.phone}</p>
                <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
                  {a.address1} {a.address2}{' '}
                  <span className="tnum text-[var(--fg-muted)]">({a.postalCode})</span>
                </p>
                {a.isRemoteArea && (
                  <p className="text-[12px] text-[var(--fg-muted)]">
                    {t('addr.remoteFee', {
                      fee: formatMoney(locale, DEFAULT_SHIPPING.remoteSurcharge),
                    })}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {!a.isDefault && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={busy !== null}
                    onClick={() => makeDefault(a)}
                  >
                    {t('addr.makeDefault')}
                  </Button>
                )}
                {/*
                  버튼 이름에 누구의 주소인지 넣는다. "삭제" 만 있으면
                  스크린리더로는 어느 줄의 삭제인지 알 수 없다.
                */}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={busy !== null}
                  aria-label={t('addr.deleteNamed', { name: a.recipient })}
                  onClick={() => remove(a)}
                >
                  {t('addr.delete')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <section aria-label={t('addr.new')} className="rounded-sm border border-[var(--border)] p-4">
          <AddressForm
            submitLabel={t('addr.save')}
            onSaved={(saved) => {
              // 새로 넣은 것은 기본이 된다. 기존 기본은 내려온다.
              setAddresses((list) => [saved, ...list.map((a) => ({ ...a, isDefault: false }))]);
              setAdding(false);
              setStatus(t('addr.added'));
            }}
            {...(addresses.length > 0 ? { onCancel: () => setAdding(false) } : {})}
          />
        </section>
      ) : (
        <div>
          <Button type="button" variant="secondary" onClick={() => setAdding(true)} disabled={full}>
            {t('addr.addNew')}
          </Button>
          {full && (
            <p className="mt-2 text-[12px] text-[var(--fg-muted)]">
              {t('addr.limit', { max: MAX_ADDRESSES })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
