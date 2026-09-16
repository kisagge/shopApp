'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { adminDate } from '~/lib/admin/date-format';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 회원 이용 정지·해제.
 *
 * 정지는 사유를 받는다 — 당사자가 왜 막혔는지 물으면 이것으로 답하고, 감사 로그에도 남는다.
 * 정지하면 그 사람의 로그인이 곧바로 끊긴다는 것을 단추 옆에 적어 둔다. 모르고 누르면 되돌려도
 * 상대는 이미 로그아웃된 뒤다.
 */
export function SuspendForm({
  userId,
  userName,
  suspendedAt,
  suspendedReason,
  suspendedBy = null,
  disabledReason,
}: {
  userId: string;
  userName: string;
  /** ISO 문자열. 서버 컴포넌트에서 Date 를 넘기지 않는다 */
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** 정지를 건 사람 — 보는 사람에 맞게 이미 적은 말 */
  suspendedBy?: string | null | undefined;
  disabledReason?: string | undefined;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const reasonId = useId();
  const hintId = useId();
  const reasonRef = useRef<HTMLInputElement>(null);

  // 단추를 눌러 연 입력으로 초점을 옮긴다 — 누른 단추가 사라져 초점이 문서 처음으로 튀지 않게
  useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);

  if (disabledReason) {
    return <p className="text-[11px] text-[var(--fg-muted)]">{disabledReason}</p>;
  }

  async function send(body: { action: 'SUSPEND'; reason: string } | { action: 'RESTORE' }) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/suspension`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        setError(await failureMessage(response, '처리하지 못했습니다.'));
        return;
      }
      setReason('');
      setOpen(false);
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (suspendedAt) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send({ action: 'RESTORE' });
        }}
        className="flex flex-col gap-1.5"
        aria-label={`${userName} 정지 해제`}
      >
        <p className="text-[11px] text-[var(--fg-secondary)]">
          <time dateTime={suspendedAt}>{adminDate.format(new Date(suspendedAt))}</time> 정지
          {suspendedBy && <> · {suspendedBy}</>}
          {suspendedReason && <> · 사유: {suspendedReason}</>}
        </p>
        <div>
          <Button type="submit" size="sm" variant="secondary" disabled={pending}>
            {pending ? '해제 중…' : '정지 해제'}
          </Button>
        </div>
        {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
      </form>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(true)}>
        이용 정지
      </Button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send({ action: 'SUSPEND', reason });
      }}
      className="flex flex-col gap-1.5"
      aria-label={`${userName} 이용 정지`}
    >
      <label htmlFor={reasonId} className="text-[11px] text-[var(--fg-secondary)]">
        정지 사유 (필수)
      </label>
      <input
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={300}
        required
        aria-describedby={hintId}
        ref={reasonRef}
        className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
      />
      <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
        정지하면 이 회원의 로그인이 바로 끊기고 다시 로그인할 수 없습니다.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending || reason.trim() === ''}>
          {pending ? '정지 중…' : '정지'}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          취소
        </Button>
      </div>
      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
