'use client';

import { useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Field } from '@shop/ui';
import { COMMISSION_MAX_PERCENT, COMMISSION_MIN_PERCENT, isCommissionPercent } from '@shop/core';

type FieldName = 'commissionPercent' | 'reason';

/**
 * 수수료율 — **슈퍼관리자만 연다.**
 *
 * 바꾼 값은 아직 확정하지 않은 기간부터 쓰인다. 이미 확정한 정산은 그때의 요율로 얼려 있어 달라지지 않는다 —
 * 화면이 그 사실을 먼저 말한다. 달 중간에 바꾸면 그 달 전체가 새 요율로 계산된다는 뜻이기도 하다.
 */
export function MerchantCommissionForm({
  merchantId,
  initial,
  /** 새 요율이 처음 적용될 정산 기간(YYYY-MM) */
  appliesFrom,
}: {
  merchantId: string;
  initial: number;
  appliesFrom: string;
}) {
  const router = useRouter();
  const [percent, setPercent] = useState(String(initial));
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState('');
  const [failure, setFailure] = useState<string | null>(null);

  const percentRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLInputElement>(null);

  function validate(): boolean {
    const next: Partial<Record<FieldName, string>> = {};
    if (!isCommissionPercent(Number(percent))) {
      next.commissionPercent = `수수료율은 ${COMMISSION_MIN_PERCENT}~${COMMISSION_MAX_PERCENT} 사이 정수입니다.`;
    }
    // 사유 없이 바꾼 기록은 나중에 "왜 이 요율이 됐는가" 에 답하지 못한다
    if (reason.trim() === '') next.reason = '바꾸는 사유를 적어 주세요.';
    setErrors(next);
    if (next.commissionPercent) percentRef.current?.focus();
    else if (next.reason) reasonRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setStatus('');
    setFailure(null);
    if (!validate()) return;

    setPending(true);
    try {
      const response = await fetch(`/api/admin/merchants/${encodeURIComponent(merchantId)}/commission`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ commissionPercent: Number(percent), reason }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        fields?: Partial<Record<FieldName, string>>;
      };
      if (!response.ok) {
        if (body.fields) setErrors(body.fields);
        setFailure(body.message ?? '저장하지 못했습니다.');
        return;
      }
      setStatus(`수수료율을 ${percent}% 로 바꿨습니다. ${appliesFrom} 정산부터 적용됩니다.`);
      setReason('');
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
        ref={percentRef}
        label="수수료율 (%)"
        required
        type="number"
        inputMode="numeric"
        min={COMMISSION_MIN_PERCENT}
        max={COMMISSION_MAX_PERCENT}
        value={percent}
        onChange={(e) => setPercent(e.target.value)}
        error={errors.commissionPercent}
        className="tnum max-w-[8rem]"
        hint={`${appliesFrom} 정산부터 적용됩니다. 이미 확정한 정산은 그때 요율로 남습니다.`}
      />
      <Field
        ref={reasonRef}
        label="바꾸는 사유"
        required
        autoComplete="off"
        maxLength={200}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        error={errors.reason}
        hint="감사 로그에 함께 남습니다. 예: 2026년 재계약, 프로모션 기간 인하"
      />

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="md" variant="secondary" disabled={pending}>
          {pending ? '보내는 중…' : '수수료율 저장'}
        </Button>
        {/* 늘 있는 알림 영역 — 새로 생기는 영역은 화면 낭독기가 놓친다 */}
        <p role="status" className="text-[12px] text-success">{status}</p>
      </div>
      {failure && <p role="alert" className="text-[12px] text-accent">{failure}</p>}
    </form>
  );
}
