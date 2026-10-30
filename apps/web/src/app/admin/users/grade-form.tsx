'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MEMBER_GRADE, type MemberGrade } from '@shop/core';
import { Button } from '@shop/ui';
import { failureMessage } from '~/lib/client/failure-message';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';

/** 운영 화면은 한국어다 — 손님 화면의 등급 이름은 사전이 세 말로 갖고 있다 */
const GRADE_LABEL: Readonly<Record<MemberGrade, string>> = {
  BASIC: '베이직',
  SILVER: '실버',
  GOLD: '골드',
  VIP: 'VIP',
};

/**
 * 회원 등급 올려 주기.
 *
 * **올려 주는 창구다.** 실제 등급은 언제나 누적 구매액에서 계산되고, 여기서 적는 값은 그보다 **낮아질 수
 * 없는 바닥**이다 — 제휴·보상으로 올려 준 등급이 구매액 때문에 도로 내려가면 손님이 납득하지 못한다.
 * 그래서 지금 등급보다 낮은 값은 고를 수 없게 한다: 골라 봐야 서버가 거절하고, 운영자는 왜 안 되는지
 * 모른 채 다시 누른다.
 *
 * 사유를 받는다 — 등급에는 적립률이 붙어 있어 이건 곧 돈이고, 나중에 "왜 이 사람만 VIP 인가" 에 답할
 * 수 있어야 한다.
 */
export function GradeForm({
  userId,
  userName,
  current,
  disabledReason,
}: {
  userId: string;
  userName: string;
  /** 지금 실제로 적용되는 등급 */
  current: MemberGrade;
  disabledReason?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [grade, setGrade] = useState<MemberGrade | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const gradeId = useId();
  const reasonId = useId();
  const hintId = useId();
  const panelId = useId();

  /*
   * **칸이 아니라 폼으로 옮기고, 닫으면 단추로 돌려준다.**
   *
   * 여기서는 손으로 적은 이펙트가 열 때만 챙기고 있었다 — 고른 칸(select)으로 바로 옮기니
   * 낭독기는 "고르세요" 만 읽고 **무엇이 열렸는지는 말하지 않았다.** 그리고 닫을 때는 아무것도
   * 하지 않아, 취소를 누르면 초점이 사라진 폼과 함께 문서 처음으로 떨어졌다.
   *
   * 규칙은 훅에 모여 있다(useDisclosureFocus). 같은 모양이 저장소에 아홉 개라, 각자 적으면
   * 각자 다르게 빠뜨린다.
   */
  const { triggerRef, panelRef } = useDisclosureFocus(open);

  /** 지금보다 높은 것만. 낮은 값은 적어 봐야 화면이 그대로다(effectiveGrade 가 높은 쪽을 쓴다) */
  const higher = MEMBER_GRADE.slice(MEMBER_GRADE.indexOf(current) + 1);

  if (disabledReason) {
    return <p className="text-[11px] text-[var(--fg-muted)]">{disabledReason}</p>;
  }

  if (higher.length === 0) {
    return <p className="text-[11px] text-[var(--fg-muted)]">이미 가장 높은 등급입니다.</p>;
  }

  if (!open) {
    return (
      <Button
        type="button"
        size="sm"
        variant="secondary"
        ref={triggerRef}
        aria-expanded={false}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
      >
        등급 올리기
      </Button>
    );
  }

  async function send(): Promise<void> {
    if (pending || grade === '') return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/grade`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ grade, reason }),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '등급을 바꾸지 못했습니다.'));
        return;
      }
      setOpen(false);
      setGrade('');
      setReason('');
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id={panelId}
      ref={panelRef}
      /* 초점을 받을 수 있게 하되 탭 순서에는 넣지 않는다 — 열릴 때 우리가 옮겨 줄 뿐이다 */
      tabIndex={-1}
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex flex-col gap-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--fg)]"
      aria-label={`${userName} 등급 올리기`}
    >
      <label htmlFor={gradeId} className="text-[11px] text-[var(--fg-secondary)]">
        올려 줄 등급
      </label>
      <select
        id={gradeId}
        value={grade}
        onChange={(e) => setGrade(e.target.value as MemberGrade)}
        required
        className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
      >
        <option value="">고르세요</option>
        {higher.map((g) => (
          <option key={g} value={g}>{GRADE_LABEL[g]}</option>
        ))}
      </select>

      <label htmlFor={reasonId} className="text-[11px] text-[var(--fg-secondary)]">
        사유 (필수)
      </label>
      <input
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        required
        aria-describedby={hintId}
        className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
      />
      <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
        적립률이 함께 올라갑니다. 구매액이 더 높은 등급을 말하면 그쪽을 따르고, 여기서 준 등급은
        구매액 때문에 내려가지 않습니다.
      </p>

      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}

      <div className="flex gap-2">
        <Button type="submit" size="sm" aria-disabled={pending}>
          {pending ? '올리는 중…' : '등급 올리기'}
        </Button>
        {/* 되돌아가는 길은 잠기지 않는다 — 보내는 중에도 마음을 바꿀 수 있어야 한다 */}
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          취소
        </Button>
      </div>
    </form>
  );
}
