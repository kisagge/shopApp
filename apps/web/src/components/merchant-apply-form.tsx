'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';

type Values = {
  name: string; brandName: string; businessName: string;
  businessNumber: string; representative: string;
  contactEmail: string; contactPhone: string;
};

const EMPTY: Values = {
  name: '', brandName: '', businessName: '',
  businessNumber: '', representative: '', contactEmail: '', contactPhone: '',
};

/**
 * 입점 신청서.
 *
 * 서버가 돌려준 필드 에러를 그대로 각 입력 옆에 붙인다 — 상품 폼과 같은
 * 방식이다. 클라이언트에서 미리 검사하지 않는 이유는 검사 규칙이 두 벌이
 * 되면 언젠가 어긋나기 때문이다.
 */
export function MerchantApplyForm({ defaultEmail }: { defaultEmail: string }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>({ ...EMPTY, contactEmail: defaultEmail });
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const set = (key: keyof Values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});
    setFormError(null);

    try {
      const response = await fetch('/api/merchant/apply', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          message?: string;
          fields?: Record<string, string>;
        };
        setErrors(data.fields ?? {});
        setFormError(data.message ?? '신청하지 못했습니다.');
        return;
      }

      // 같은 주소가 신청 현황 화면으로 바뀐다
      router.refresh();
    } catch {
      setFormError('네트워크 오류로 신청하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-6">
      {formError && (
        <p
          role="alert"
          className="rounded-sm border border-accent bg-accent-soft px-4 py-3 text-[13px] text-accent"
        >
          {formError}
        </p>
      )}

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="text-[13px] font-semibold">브랜드</legend>
        <Field
          label="가맹점 이름" required value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors['name']}
          hint="운영진 화면에 뜨는 이름입니다."
        />
        <Field
          label="브랜드 이름" required value={values.brandName}
          onChange={(e) => set('brandName', e.target.value)}
          error={errors['brandName']}
          hint="매대에 뜨는 이름입니다. 승인되면 이 이름으로 브랜드가 만들어집니다."
        />
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="text-[13px] font-semibold">사업자 정보</legend>
        <Field
          label="상호" required value={values.businessName}
          onChange={(e) => set('businessName', e.target.value)}
          error={errors['businessName']}
        />
        <Field
          label="사업자등록번호" required value={values.businessNumber}
          onChange={(e) => set('businessNumber', e.target.value)}
          error={errors['businessNumber']}
          inputMode="numeric"
          placeholder="000-00-00000"
          hint="하이픈 없이 적으셔도 됩니다."
        />
        <Field
          label="대표자" required value={values.representative}
          onChange={(e) => set('representative', e.target.value)}
          error={errors['representative']}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-5 border-0 p-0">
        <legend className="text-[13px] font-semibold">연락처</legend>
        <Field
          label="이메일" type="email" required value={values.contactEmail}
          onChange={(e) => set('contactEmail', e.target.value)}
          error={errors['contactEmail']}
          hint="심사 결과를 이 주소로 알려 드립니다."
        />
        <Field
          label="전화번호" type="tel" required value={values.contactPhone}
          onChange={(e) => set('contactPhone', e.target.value)}
          error={errors['contactPhone']}
        />
      </fieldset>

      <Button type="submit" disabled={pending} className="self-start">
        {pending ? '보내는 중…' : '입점 신청'}
      </Button>
    </form>
  );
}
