'use client';

import { useEffect, useState } from 'react';
import { Badge, Button } from '@shop/ui';
import { AddressForm, type SavedAddress } from '~/components/address-form';

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
}: {
  currentId: string | null;
  onPicked: (address: SavedAddress) => void;
  onCancel: () => void;
}) {
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
        if (alive) setError('배송지를 불러오지 못했습니다.');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function apply() {
    const target = addresses?.find((a) => a.id === selected);
    if (!target) return;

    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/addresses/${target.id}`, { method: 'PATCH' });
      if (!response.ok) {
        setError('배송지를 바꾸지 못했습니다.');
        return;
      }
      onPicked(target);
    } catch {
      setError('네트워크 오류로 바꾸지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (adding) {
    return (
      <AddressForm
        onSaved={onPicked}
        submitLabel="이 주소로 배송받기"
        onCancel={
          addresses && addresses.length > 0 ? () => setAdding(false) : onCancel
        }
      />
    );
  }

  if (addresses === null) {
    return <p className="py-6 text-center text-[13px] text-[var(--fg-muted)]">불러오는 중…</p>;
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
          받으실 곳을 골라 주세요
        </legend>
        {addresses.map((a) => (
          <label
            key={a.id}
            className="flex cursor-pointer items-start gap-3 rounded-sm border border-[var(--border)] p-3.5 has-[:checked]:border-n-900"
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
                {a.isDefault && <Badge tone="neutral">기본</Badge>}
              </span>
              <span className="tnum text-[13px] text-[var(--fg-secondary)]">{a.phone}</span>
              <span className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
                {a.address1} {a.address2}{' '}
                <span className="tnum text-[var(--fg-muted)]">({a.postalCode})</span>
              </span>
              {a.isRemoteArea && (
                <span className="text-[12px] text-[var(--fg-muted)]">
                  도서산간 추가 배송비 3,000원
                </span>
              )}
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={() => void apply()} disabled={pending || selected === null}>
          {pending ? '바꾸는 중…' : '이 주소로 배송받기'}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setAdding(true)}>
          새 배송지 추가
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          취소
        </Button>
      </div>
    </div>
  );
}
