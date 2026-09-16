'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { isBusinessNumber } from '@shop/core';

type FieldName = 'name' | 'businessName' | 'businessNumber' | 'representative';

const FIELD_ORDER: readonly FieldName[] = ['name', 'businessName', 'businessNumber', 'representative'];

/**
 * 사업자 정보 — **운영진만 연다.**
 *
 * 정산과 세금계산서가 이 값을 근거로 삼는다. 가맹점이 스스로 바꿀 수 있으면 돈 받는 주체가 심사 없이 바뀌므로, 바꿀 일이
 * 생기면 운영진에게 말하고 그 사실이 감사 로그에 남는 편이 옳다.
 */
export function MerchantBusinessForm({
  merchantId,
  initial,
}: {
  merchantId: string;
  initial: { name: string; businessName: string; businessNumber: string; representative: string };
}) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  const businessNameRef = useRef<HTMLInputElement>(null);
  const businessNumberRef = useRef<HTMLInputElement>(null);
  const representativeRef = useRef<HTMLInputElement>(null);

  const set = (name: FieldName) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  function focusFirst(found: Partial<Record<FieldName, string>>): void {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (!first) return;
    const field = {
      name: nameRef, businessName: businessNameRef,
      businessNumber: businessNumberRef, representative: representativeRef,
    }[first];
    field.current?.focus();
  }

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (values.name.trim() === '') next.name = '가맹점 이름을 입력해 주세요.';
    if (values.businessName.trim() === '') next.businessName = '상호를 입력해 주세요.';
    // 하이픈을 빼고 적는 사람이 많다 — 거절하지 않고 표준 표기로 맞춘다(서버도 같은 일을 한다)
    if (!isBusinessNumber(values.businessNumber)) {
      next.businessNumber = '사업자등록번호 10자리를 입력해 주세요.';
    }
    if (values.representative.trim() === '') next.representative = '대표자 이름을 입력해 주세요.';
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
        method: 'PATCH',
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
      setStatus('사업자 정보를 고쳤습니다. 누가 무엇을 바꿨는지 감사 로그에 남습니다.');
      router.refresh();
    } catch {
      setFailure('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field
        ref={nameRef}
        label="가맹점 이름"
        required
        autoComplete="off"
        maxLength={40}
        value={values.name}
        onChange={set('name')}
        error={errors.name}
        hint="운영 화면에서 부르는 이름입니다. 매대에 뜨는 것은 브랜드 이름입니다."
      />
      <Field
        ref={businessNameRef}
        label="상호"
        required
        autoComplete="off"
        maxLength={60}
        value={values.businessName}
        onChange={set('businessName')}
        error={errors.businessName}
      />
      <Field
        ref={businessNumberRef}
        label="사업자등록번호"
        required
        inputMode="numeric"
        autoComplete="off"
        maxLength={12}
        value={values.businessNumber}
        onChange={set('businessNumber')}
        error={errors.businessNumber}
        className="tnum max-w-[14rem]"
      />
      <Field
        ref={representativeRef}
        label="대표자"
        required
        autoComplete="off"
        maxLength={20}
        value={values.representative}
        onChange={set('representative')}
        error={errors.representative}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" variant="secondary" disabled={pending}>
          {pending ? '보내는 중…' : '사업자 정보 저장'}
        </Button>
        <p role="status" className="text-[12px] text-success">{status}</p>
      </div>
      {failure && <p role="alert" className="text-[12px] text-accent">{failure}</p>}
    </form>
  );
}
