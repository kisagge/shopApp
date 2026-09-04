'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button, Field } from '@shop/ui';
import { remoteAreaLabel } from '@shop/core';
import { openPostcodeSearch } from '~/lib/postcode';

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
  const [address1, setAddress1] = useState('');

  // 주소 검색 상태. searchable 이 false 면 스크립트를 못 불러온 것이라
  // 버튼을 감추고 손 입력만 남긴다.
  const [searching, setSearching] = useState(false);
  const [searchable, setSearchable] = useState(true);
  const searchBoxRef = useRef<HTMLDivElement>(null);
  const searchButtonRef = useRef<HTMLButtonElement>(null);
  const detailRef = useRef<HTMLInputElement>(null);

  // 우편번호를 넣는 즉시 알려 준다. 결제 직전에 처음 보면 놀란다.
  const remote = remoteAreaLabel(postalCode);

  function closeSearch() {
    setSearching(false);
    // 열기 전에 있던 자리로 초점을 돌려준다. 안 돌려주면 키보드 사용자는
    // 문서 맨 위로 튕겨 나가 처음부터 다시 내려와야 한다.
    searchButtonRef.current?.focus();
  }

  /**
   * Esc 로 닫는다.
   *
   * 문서 수준에서 듣는다. 검색 영역에 핸들러를 달면 그 안에 초점이 있을
   * 때만 동작하고, 비상호작용 요소에 키 핸들러를 다는 것이기도 하다.
   *
   * 다만 위젯은 iframe 이라 그 안에서 누른 키는 우리에게 오지 않는다.
   * 확실한 출구는 닫기 버튼이고, Esc 는 그 위에 얹는 편의다.
   */
  useEffect(() => {
    if (!searching) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSearch();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [searching]);

  useEffect(() => {
    if (!searching || !searchBoxRef.current) return;

    let alive = true;
    void openPostcodeSearch(
      searchBoxRef.current,
      ({ postalCode: code, address }) => {
        if (!alive) return;
        setPostalCode(code);
        setAddress1(address);
        setSearching(false);
        // 남은 것은 상세 주소뿐이다. 거기로 데려다 준다.
        requestAnimationFrame(() => detailRef.current?.focus());
      },
      () => {
        if (alive) closeSearch();
      },
    ).catch(() => {
      if (!alive) return;
      // 광고 차단기나 사내 네트워크에서 막힐 수 있다. 손 입력은 그대로 된다.
      setSearchable(false);
      setSearching(false);
      setError('주소 검색을 불러오지 못했습니다. 우편번호와 주소를 직접 입력해 주세요.');
    });

    return () => {
      alive = false;
    };
  }, [searching]);

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
    <form onSubmit={(e) => onSubmit(e)} className="flex flex-col gap-4">
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

      {/*
        버튼을 입력칸 옆에 맞춘다.
        Field 는 라벨·입력·힌트를 세로로 쌓으므로 items-end 로 묶으면
        **힌트까지 포함한 아래**가 기준이 되어 버튼이 입력칸보다 내려간다.
        힌트를 빼고 형식은 placeholder 로 보여 주면 두 요소의 아래가 맞는다.
      */}
      <div className="flex items-end gap-2">
        <Field
          label="우편번호"
          name="postalCode"
          required
          inputMode="numeric"
          maxLength={5}
          autoComplete="postal-code"
          placeholder="12345"
          className="w-[140px]"
          value={postalCode}
          onChange={(e) => setPostalCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
          error={fieldErrors['postalCode']}
        />
        {/*
          검색은 편의로 얹는다. 스크립트를 못 불러오면 버튼만 사라지고
          손 입력은 그대로 된다 — 외부 스크립트 하나 때문에 주소를 넣을
          방법이 통째로 사라지면 안 된다.
        */}
        {searchable && (
          <Button
            type="button"
            variant="secondary"
            ref={searchButtonRef}
            onClick={() => setSearching((v) => !v)}
            aria-expanded={searching}
            aria-controls="postcode-search"
          >
            {searching ? '검색 닫기' : '주소 검색'}
          </Button>
        )}
      </div>

      {searching && (
        <section
          id="postcode-search"
          aria-label="주소 검색"
          className="rounded-sm border border-[var(--border)]"
        >
          <div ref={searchBoxRef} className="h-[420px] w-full" />
          <div className="border-t border-[var(--border)] p-2 text-right">
            <Button type="button" variant="ghost" size="sm" onClick={closeSearch}>
              닫기
            </Button>
          </div>
        </section>
      )}

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
        placeholder="주소 검색을 쓰거나 직접 입력해 주세요"
        value={address1}
        onChange={(e) => setAddress1(e.target.value)}
        error={fieldErrors['address1']}
      />

      <Field
        label="상세 주소"
        name="address2"
        ref={detailRef}
        maxLength={200}
        hint="동·호수 등"
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
