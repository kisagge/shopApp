'use client';

import { useState, type FormEvent } from 'react';
import { Button, Field } from '@shop/ui';
import { remoteAreaLabel } from '@shop/core';

export interface SavedAddress {
  id: string;
  label: string | null;
  recipient: string;
  phone: string;
  postalCode: string;
  address1: string;
  address2: string | null;
  isRemoteArea: boolean;
  isDefault: boolean;
}

/**
 * 배송지 입력.
 *
 * 주문 화면 안에서 바로 등록한다. "배송지를 먼저 등록해 주세요" 라고만
 * 적어 두면 어디로 가야 하는지 알 수 없고, 다른 화면으로 보내면 담아 둔
 * 것과 입력하던 요청사항을 두고 떠나게 된다.
 *
 * 도서산간 여부는 **묻지 않는다.** 추가 배송비가 걸린 값이라 사용자가
 * 고르게 두면 제주에 사는 사람이 체크를 풀고 3,000원을 아낀다. 우편번호를
 * 넣으면 서버가 정하고, 화면에는 왜 추가 요금이 붙는지 미리 알려 준다.
 */
export function AddressForm({
  onSaved,
  onCancel,
  submitLabel = '이 주소로 배송받기',
}: {
  onSaved: (address: SavedAddress) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [postalCode, setPostalCode] = useState('');

  // 우편번호를 넣는 즉시 알려 준다. 결제 직전에 처음 보면 놀란다.
  const remote = remoteAreaLabel(postalCode);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    /**
     * FormData.get 은 string 또는 File 을 준다. String() 을 씌우면 File 이
     * "[object File]" 이 되어 조용히 통과한다 — 주문번호 재시도에서 똑같이
     * 당했던 자리다. 문자열일 때만 쓴다.
     */
    const text = (key: string) => {
      const value = data.get(key);
      return typeof value === 'string' ? value.trim() : '';
    };
    const body = {
      ...(text('label') ? { label: text('label') } : {}),
      recipient: text('recipient'),
      phone: text('phone'),
      postalCode: text('postalCode'),
      address1: text('address1'),
      ...(text('address2') ? { address2: text('address2') } : {}),
      isDefault: true,
    };

    try {
      const response = await fetch('/api/addresses', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as {
        address?: SavedAddress;
        message?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok || !result.address) {
        setError(result.message ?? '배송지를 저장하지 못했습니다.');
        setFieldErrors(result.fields ?? {});
        return;
      }
      onSaved(result.address);
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      {/*
        오류는 폼 맨 위에 두고 role="alert" 로 알린다. 칸 옆에만 적으면
        스크린리더 사용자는 제출 뒤 무슨 일이 일어났는지 모른 채 남는다.
      */}
      {error && (
        <p
          role="alert"
          className="rounded-sm bg-[var(--accent-soft)] px-3.5 py-2.5 text-[13px] text-accent"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="받는 분"
          name="recipient"
          required
          maxLength={50}
          autoComplete="name"
          error={fieldErrors['recipient']}
        />
        <Field
          label="휴대폰 번호"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="010-0000-0000"
          error={fieldErrors['phone']}
        />
      </div>

      <Field
        label="우편번호"
        name="postalCode"
        required
        inputMode="numeric"
        maxLength={5}
        autoComplete="postal-code"
        hint="5자리 숫자"
        value={postalCode}
        onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
        error={fieldErrors['postalCode']}
      />

      {/*
        도서산간이면 저장하기 전에 알린다. aria-live 로 우편번호를 다 넣는
        순간 스크린리더에도 읽힌다 — 눈으로만 보이면 알 방법이 없다.
        비어 있을 때도 요소를 지우지 않는다. 사라졌다 나타나는 영역은
        읽히지 않을 때가 있다.
      */}
      <p aria-live="polite" className="min-h-[18px] text-[12px] text-[var(--fg-muted)]">
        {remote ? `${remote} 지역이라 도서산간 추가 배송비 3,000원이 붙습니다.` : ''}
      </p>

      <Field
        label="주소"
        name="address1"
        required
        maxLength={200}
        autoComplete="street-address"
        placeholder="시·군·구까지 포함해 입력해 주세요"
        error={fieldErrors['address1']}
      />

      <Field
        label="상세 주소"
        name="address2"
        maxLength={200}
        hint="선택"
        error={fieldErrors['address2']}
      />

      <Field label="배송지 이름" name="label" maxLength={20} hint="선택 · 집, 회사처럼" />

      <div className="mt-1 flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? '저장하는 중…' : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={pending}>
            취소
          </Button>
        )}
      </div>
    </form>
  );
}
