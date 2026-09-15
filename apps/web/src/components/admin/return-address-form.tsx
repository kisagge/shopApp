'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { PHONE_PATTERN, POSTAL_CODE_PATTERN, type ReturnAddress } from '@shop/core';

type FieldName = 'recipient' | 'phone' | 'postalCode' | 'address1' | 'address2';

const FIELD_ORDER: readonly FieldName[] = ['recipient', 'phone', 'postalCode', 'address1', 'address2'];

/**
 * 반품지 등록·수정 — 가맹점 반품지와 플랫폼 반품지가 같이 쓴다.
 *
 * **이 주소가 곧 손님이 상자에 적는 주소다.** 칸 곁에 그 사실을 적는다 — 사무실 주소를 적으면 물건이 사무실로 간다.
 * 저장해도 폼은 남는다(이 화면의 일이 이 주소다). 결과는 늘 있는 알림 영역에 적고, 틀린 칸이 있으면 첫 칸으로 초점을
 * 옮긴다. 서버가 거절한 칸(형식)도 같은 자리에 적는다.
 */
export function ReturnAddressForm({
  owner,
  initial,
}: {
  /** 가맹점 id, 또는 플랫폼 반품지면 'platform' */
  owner: string;
  initial: ReturnAddress | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<FieldName, string>>({
    recipient: initial?.recipient ?? '',
    phone: initial?.phone ?? '',
    postalCode: initial?.postalCode ?? '',
    address1: initial?.address1 ?? '',
    address2: initial?.address2 ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);
  /*
   * 칸마다 따로 둔다. 하나의 객체에 모아 `ref={refs.x}` 로 넘기면 그리는 동안 참조를 읽는 것으로 잡힌다
   * (react-hooks/refs) — 초점을 옮기는 것은 제출 뒤의 일이라 손에서만 읽는다.
   */
  const recipientRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const postalCodeRef = useRef<HTMLInputElement>(null);
  const address1Ref = useRef<HTMLInputElement>(null);
  const address2Ref = useRef<HTMLInputElement>(null);

  const set = (name: FieldName) => (e: { target: { value: string } }) =>
    setValues((v) => ({ ...v, [name]: e.target.value }));

  function focusFirst(found: Partial<Record<FieldName, string>>): void {
    const first = FIELD_ORDER.find((f) => found[f]);
    if (!first) return;
    const field = {
      recipient: recipientRef, phone: phoneRef, postalCode: postalCodeRef,
      address1: address1Ref, address2: address2Ref,
    }[first];
    field.current?.focus();
  }

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (values.recipient.trim() === '') next.recipient = '받는 분을 입력해 주세요.';
    if (!PHONE_PATTERN.test(values.phone.trim())) next.phone = '휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.';
    if (!POSTAL_CODE_PATTERN.test(values.postalCode.trim())) next.postalCode = '우편번호 5자리를 입력해 주세요.';
    if (values.address1.trim() === '') next.address1 = '주소를 입력해 주세요.';
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
      const response = await fetch(`/api/admin/return-addresses/${encodeURIComponent(owner)}`, {
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
      setStatus('반품지를 저장했습니다. 다음 승인부터 손님에게 이 주소를 안내합니다.');
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
        ref={recipientRef}
        label="받는 분"
        required
        autoComplete="off"
        maxLength={50}
        value={values.recipient}
        onChange={set('recipient')}
        error={errors.recipient}
        hint="택배 송장의 받는 사람 칸에 그대로 적힙니다. 예: 스튜디오눈 반품담당"
      />
      <Field
        ref={phoneRef}
        label="반품 담당자 휴대폰"
        required
        type="tel"
        inputMode="tel"
        autoComplete="off"
        value={values.phone}
        onChange={set('phone')}
        error={errors.phone}
        hint="택배 기사가 도착 전에 거는 번호입니다."
      />
      <Field
        ref={postalCodeRef}
        label="우편번호"
        required
        inputMode="numeric"
        autoComplete="off"
        maxLength={5}
        value={values.postalCode}
        onChange={set('postalCode')}
        error={errors.postalCode}
        className="tnum max-w-[10rem]"
      />
      <Field
        ref={address1Ref}
        label="주소"
        required
        autoComplete="off"
        maxLength={200}
        value={values.address1}
        onChange={set('address1')}
        error={errors.address1}
        hint="물건을 실제로 받는 창고 주소를 적어 주세요. 사무실과 다르면 창고 주소입니다."
      />
      <Field
        ref={address2Ref}
        label="상세주소"
        autoComplete="off"
        maxLength={200}
        value={values.address2}
        onChange={set('address2')}
        error={errors.address2}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" disabled={pending}>
          {/* 이름에 '저장' 을 쓰지 않는다 — 같은 화면의 배송비 '저장' 과 이름으로 겹친다 */}
          {pending ? '보내는 중…' : initial ? '반품지 수정' : '반품지 등록'}
        </Button>
        {/* 늘 있는 알림 영역 — 새로 생기는 영역은 화면 낭독기가 놓친다 */}
        <p role="status" className="text-[12px] text-success">{status}</p>
      </div>
      {failure && <p role="alert" className="text-[12px] text-accent">{failure}</p>}
    </form>
  );
}
