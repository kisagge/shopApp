'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { SETTLEMENT_BANK, SETTLEMENT_BANK_LABEL } from '@shop/core';

type FieldName = 'contactEmail' | 'contactPhone' | 'settlementBank' | 'settlementAccount' | 'settlementHolder';

const FIELD_ORDER: readonly FieldName[] = [
  'contactEmail', 'contactPhone', 'settlementBank', 'settlementAccount', 'settlementHolder',
];

export interface MerchantSettingsValues {
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly settlementBank: string | null;
  readonly settlementAccount: string | null;
  readonly settlementHolder: string | null;
}

/**
 * 연락처와 정산 계좌.
 *
 * **돈이 나가는 자리다.** 은행은 고르게 하고(자유 입력이면 "국민"·"국민은행"·"KB국민" 이 한 표에 섞인다), 계좌번호는
 * 숫자만 남겨 저장한다 — 같은 계좌가 하이픈 유무로 둘이 되면 바뀌었는지 알 수 없다.
 *
 * 예금주가 사업자명과 다르면 막지 않고 **말만 한다**. 개인사업자가 대표 이름으로 받는 일은 흔하고, 그것을 막으면
 * 멀쩡한 계좌를 못 넣는다. 다만 오타일 때가 더 많으므로 눈에 띄게 적어 둔다.
 */
export function MerchantSettingsForm({
  merchantId,
  initial,
  businessName,
}: {
  merchantId: string;
  initial: MerchantSettingsValues;
  /** 예금주와 견줘 보라고 곁에 적는 이름 */
  businessName: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState({
    contactEmail: initial.contactEmail,
    contactPhone: initial.contactPhone,
    settlementBank: initial.settlementBank ?? '',
    settlementAccount: initial.settlementAccount ?? '',
    settlementHolder: initial.settlementHolder ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  // 칸마다 따로 둔다 — 하나의 객체에 모아 넘기면 그리는 동안 참조를 읽는 것으로 잡힌다(react-hooks/refs)
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const bankRef = useRef<HTMLSelectElement>(null);
  const accountRef = useRef<HTMLInputElement>(null);
  const holderRef = useRef<HTMLInputElement>(null);

  const set = (name: FieldName) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  function focusFirst(found: Partial<Record<FieldName, string>>): void {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (!first) return;
    const field = {
      contactEmail: emailRef, contactPhone: phoneRef, settlementBank: bankRef,
      settlementAccount: accountRef, settlementHolder: holderRef,
    }[first];
    field.current?.focus();
  }

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (!values.contactEmail.includes('@')) next.contactEmail = '연락 받을 이메일을 입력해 주세요.';
    if (values.contactPhone.trim() === '') next.contactPhone = '연락처를 입력해 주세요.';
    if (values.settlementBank === '') next.settlementBank = '은행을 골라 주세요.';
    if (values.settlementAccount.replace(/\D/g, '').length < 8) {
      next.settlementAccount = '계좌번호는 숫자 8자리 이상입니다.';
    }
    if (values.settlementHolder.trim() === '') next.settlementHolder = '예금주를 입력해 주세요.';
    setErrors(next);
    focusFirst(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus('');
    setFailure(null);
    if (!validate()) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        fields?: Partial<Record<FieldName, string>>;
      };
      if (!response.ok) {
        if (body.fields) {
          setErrors(body.fields);
          focusFirst(body.fields);
        }
        setFailure(body.message ?? '저장하지 못했습니다.');
        return;
      }
      setStatus('저장했습니다. 다음 정산 지급부터 이 계좌로 보냅니다.');
      router.refresh();
    } catch {
      setFailure('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  const holderDiffers =
    values.settlementHolder.trim() !== '' && values.settlementHolder.trim() !== businessName.trim();

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field
        ref={emailRef}
        label="연락 이메일"
        required
        type="email"
        autoComplete="off"
        maxLength={120}
        value={values.contactEmail}
        onChange={set('contactEmail')}
        error={errors.contactEmail}
        hint="입점·정산 안내를 이 주소로 보냅니다."
      />
      <Field
        ref={phoneRef}
        label="연락처"
        required
        type="tel"
        inputMode="tel"
        autoComplete="off"
        maxLength={20}
        value={values.contactPhone}
        onChange={set('contactPhone')}
        error={errors.contactPhone}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="settlementBank" className="text-xs font-medium text-[var(--fg-secondary)]">
          은행
          <span className="ml-1 text-accent" aria-hidden="true">*</span>
          <span className="sr-only"> (필수)</span>
        </label>
        <select
          ref={bankRef}
          id="settlementBank"
          value={values.settlementBank}
          onChange={set('settlementBank')}
          aria-invalid={errors.settlementBank ? true : undefined}
          aria-describedby={errors.settlementBank ? 'settlementBank-error' : undefined}
          className="h-11 max-w-[16rem] rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-sm"
        >
          <option value="">고르세요</option>
          {SETTLEMENT_BANK.map((bank) => (
            <option key={bank} value={bank}>{SETTLEMENT_BANK_LABEL[bank]}</option>
          ))}
        </select>
        {errors.settlementBank && (
          <p id="settlementBank-error" role="alert" className="text-[12px] text-accent">
            {errors.settlementBank}
          </p>
        )}
      </div>

      <Field
        ref={accountRef}
        label="계좌번호"
        required
        inputMode="numeric"
        autoComplete="off"
        maxLength={25}
        value={values.settlementAccount}
        onChange={set('settlementAccount')}
        error={errors.settlementAccount}
        className="tnum max-w-[20rem]"
        hint="숫자만 저장합니다. 하이픈은 넣어도 됩니다."
      />
      <Field
        ref={holderRef}
        label="예금주"
        required
        autoComplete="off"
        maxLength={20}
        value={values.settlementHolder}
        onChange={set('settlementHolder')}
        error={errors.settlementHolder}
        {...(holderDiffers
          ? { hint: `사업자명(${businessName})과 다릅니다. 개인사업자라면 대표자 이름일 수 있습니다.` }
          : {})}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {pending ? '보내는 중…' : '정보 저장'}
        </Button>
        {/* 늘 있는 알림 영역 — 새로 생기는 영역은 화면 낭독기가 놓친다 */}
        <p role="status" className="text-[12px] text-success">{status}</p>
      </div>
      {failure && <p role="alert" className="text-[12px] text-accent">{failure}</p>}
    </form>
  );
}
