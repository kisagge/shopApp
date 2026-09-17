'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';

/** 기간 확정. 여러 번 눌러도 결과가 같지만, 되돌리기 어려운 일이라 한 번 묻는다. */
export function CloseButton({ yearMonth }: { yearMonth: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'confirming' | 'pending'>('idle');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  async function close() {
    setState('pending');
    setMessage(null);
    try {
      const response = await fetch('/api/admin/settlements/close', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yearMonth }),
      });
      const data = (await response.json()) as {
        message?: string; created?: number; updated?: number; skipped?: string[];
      };
      if (!response.ok) {
        setMessage({ tone: 'error', text: data.message ?? '확정하지 못했습니다.' });
        return;
      }
      const skipped = data.skipped?.length
        ? ` 이미 확정·지급된 ${data.skipped.length}건은 건드리지 않았습니다.`
        : '';
      setMessage({
        tone: 'ok',
        text: `${yearMonth} 정산을 확정했습니다 — 신규 ${data.created ?? 0}건, 재계산 ${data.updated ?? 0}건.${skipped}`,
      });
      router.refresh();
    } catch {
      setMessage({ tone: 'error', text: '네트워크 오류로 확정하지 못했습니다.' });
    } finally {
      setState('idle');
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {state === 'confirming' ? (
        <div className="flex items-center gap-2">
          <p className="text-[12px] text-[var(--fg-secondary)]">
            {yearMonth} 정산을 확정합니다. 확정 후에는 금액이 다시 계산되지 않습니다.
          </p>
          <Button type="button" size="sm" onClick={() => close()}>확정</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setState('idle')}>
            취소
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="md"
          variant="secondary"
          disabled={state === 'pending'}
          onClick={() => setState('confirming')}
        >
          {state === 'pending' ? '확정 중…' : `${yearMonth} 정산 확정`}
        </Button>
      )}

      {message && (
        <p
          role="status"
          className={`text-[12px] ${message.tone === 'ok' ? 'text-success' : 'text-accent'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

/** 지급 집행. 돈이 실제로 나가므로 확정과 다른 사람이 누른다. */
export function PayButton({
  settlementId,
  merchantName,
  disabledReason,
}: {
  settlementId: string;
  merchantName: string;
  disabledReason?: string | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (disabledReason) {
    return <span className="text-[11px] text-[var(--fg-muted)]">{disabledReason}</span>;
  }

  async function pay() {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/settlements/${settlementId}/pay`, { method: 'POST' });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '지급 처리하지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 지급 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => pay()}>
        <span className="sr-only">{`${merchantName} `}</span>
        {pending ? '처리 중…' : '지급'}
      </Button>
      {error && <p role="alert" className="mt-1 text-[11px] text-accent">{error}</p>}
    </>
  );
}

/**
 * 지급 보류·해제.
 *
 * **보류 상태는 있었는데 보류할 길이 없었다.** 확정된 정산에 문제가 보여도 지급 단추는 그대로 살아 있었다.
 * 보류는 까닭을 적어야 누를 수 있다 — 가맹점도 그 까닭을 본다. 푸는 것은 한 번에 된다(지급 단추가 다시 생길 뿐이다).
 */
export function HoldButton({
  settlementId,
  merchantName,
  held,
}: {
  settlementId: string;
  merchantName: string;
  /** 지금 보류 중인가 */
  held: boolean;
}) {
  const router = useRouter();
  const ids = { reason: useId(), note: useId() };
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const reasonRef = useRef<HTMLInputElement>(null);
  // 누른 단추가 사라지므로 초점을 까닭 칸으로 옮긴다 — 키보드 사용자가 제자리를 잃지 않게
  useEffect(() => {
    if (open) reasonRef.current?.focus();
  }, [open]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(body: { hold: true; reason: string } | { hold: false }) {
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/settlements/${settlementId}/hold`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? '처리하지 못했습니다.');
        return;
      }
      setOpen(false);
      setReason('');
      router.refresh();
    } catch {
      setError('네트워크 오류로 처리하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (held) {
    return (
      <div className="mt-1.5 flex flex-col items-center gap-1">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => void send({ hold: false })}>
          <span className="sr-only">{`${merchantName} `}</span>
          {pending ? '푸는 중…' : '보류 해제'}
        </Button>
        {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <Button type="button" size="sm" variant="ghost" className="mt-1.5" onClick={() => setOpen(true)}>
        <span className="sr-only">{`${merchantName} `}</span>
        보류
      </Button>
    );
  }

  return (
    <form
      aria-label={`${merchantName} 정산 지급 보류`}
      className="mt-1.5 flex w-56 flex-col gap-1.5 text-left"
      onSubmit={(event) => {
        event.preventDefault();
        if (reason.trim().length === 0) {
          setError('보류 까닭을 적어 주세요. 가맹점도 이 까닭을 봅니다.');
          return;
        }
        void send({ hold: true, reason: reason.trim() });
      }}
    >
      <label htmlFor={ids.reason} className="text-[11px] text-[var(--fg-secondary)]">
        보류 까닭
      </label>
      <input
        id={ids.reason}
        value={reason}
        maxLength={200}
        onChange={(e) => setReason(e.target.value)}
        aria-describedby={ids.note}
        aria-invalid={error !== null && reason.trim().length === 0 ? true : undefined}
        ref={reasonRef}
        className="h-9 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 text-[12px]"
      />
      <p id={ids.note} className="text-[11px] text-[var(--fg-muted)]">가맹점 정산 화면에도 보입니다.</p>
      <div className="flex gap-1.5">
        <Button type="submit" size="sm" disabled={pending}>{pending ? '보류 중…' : '보류하기'}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => { setOpen(false); setError(null); }}>
          취소
        </Button>
      </div>
      {error && <p role="alert" className="text-[11px] text-accent">{error}</p>}
    </form>
  );
}
