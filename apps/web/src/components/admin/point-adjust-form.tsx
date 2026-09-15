'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { POINT_ADJUST_MAX, POINT_ADJUST_NOTE_MAX, type PointAdjustDirection } from '@shop/core';

const won = (n: number) => `${n.toLocaleString('ko-KR')}P`;

const newKey = (): string => crypto.randomUUID();

type Field = 'amount' | 'note';

/**
 * 적립금 수동 지급·차감.
 *
 * **보내기 전에 한 번 더 보여 준다** — 누구에게, 얼마를, 잔액이 어떻게 바뀌는지. 0 을 하나 더 친 실수를 여기서 본다.
 * 사유는 손님 내역에 그대로 보인다는 것을 입력 칸 곁에 적는다. 내부 메모처럼 쓰면 손님이 읽는다.
 *
 * 폼마다 열쇠를 하나 만들어 보낸다. 확정을 두 번 누르거나 응답을 못 받고 다시 눌러도 서버가 한 번만 처리한다.
 * 끝나면 열쇠를 새로 만든다 — 다음 조정은 다른 일이다.
 *
 * 끝나도 폼은 남는다(이 화면의 일이 조정이다). 결과는 늘 있는 알림 영역에 적고, 잔액·원장은 화면을 다시 읽어 바꾼다.
 */
export function PointAdjustForm({
  userId,
  userName,
  balance,
}: {
  userId: string;
  userName: string;
  balance: number;
}) {
  const router = useRouter();
  const [direction, setDirection] = useState<PointAdjustDirection>('GRANT');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [key, setKey] = useState(newKey);

  const amountId = useId();
  const amountHintId = useId();
  const amountErrorId = useId();
  const noteId = useId();
  const noteHintId = useId();
  const noteErrorId = useId();
  const summaryId = useId();
  const confirmRef = useRef<HTMLButtonElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const value = Number(amount);
  const verb = direction === 'GRANT' ? '지급' : '차감';
  const after = direction === 'GRANT' ? balance + value : balance - value;

  function validate(): boolean {
    const next: Partial<Record<Field, string>> = {};
    if (!Number.isInteger(value) || value < 1) next.amount = '1P 이상 정수로 입력해 주세요.';
    else if (value > POINT_ADJUST_MAX) next.amount = `한 번에 ${won(POINT_ADJUST_MAX)}까지 조정할 수 있습니다.`;
    else if (direction === 'DEDUCT' && value > balance) next.amount = `지금 잔액(${won(balance)})보다 많이 차감할 수 없습니다.`;
    if (note.trim() === '') next.note = '사유를 입력해 주세요.';
    setErrors(next);
    // 첫 오류 칸으로 초점 — 무엇을 고칠지 바로 듣는다
    if (next.amount) amountRef.current?.focus();
    else if (next.note) noteRef.current?.focus();
    return Object.keys(next).length === 0;
  }

  async function submit() {
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/points`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ direction, amount: value, note: note.trim(), key }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        message?: string;
        balance?: number;
        amount?: number;
        direction?: PointAdjustDirection;
      };
      if (!response.ok || body.balance === undefined) {
        setFailure(body.message ?? `${verb}하지 못했습니다.`);
        setConfirming(false);
        return;
      }
      setDone(`${userName}님에게 ${won(body.amount ?? value)}를 ${body.direction === 'DEDUCT' ? '차감' : '지급'}했습니다. 잔액 ${won(body.balance)}.`);
      setAmount('');
      setNote('');
      setConfirming(false);
      setKey(newKey());
      router.refresh();
    } catch {
      setFailure(`네트워크 오류로 ${verb}하지 못했습니다. 다시 눌러도 두 번 처리되지 않습니다.`);
    } finally {
      setPending(false);
    }
  }

  const inputClass =
    'h-10 w-full rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px] aria-[invalid=true]:border-accent';

  return (
    <form
      aria-labelledby={`${summaryId}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setDone(null);
        setFailure(null);
        if (validate()) setConfirming(true);
      }}
      className="flex flex-col gap-4"
    >
      <h2 id={`${summaryId}-title`} className="text-[15px] font-semibold tracking-tight">포인트 지급 · 차감</h2>

      <fieldset disabled={confirming || pending} className="flex flex-col gap-4">
        <fieldset className="flex gap-4 text-[13px]">
          <legend className="sr-only">지급 또는 차감</legend>
          {(['GRANT', 'DEDUCT'] as const).map((d) => (
            <label key={d} className="flex items-center gap-1.5">
              <input
                type="radio"
                name="direction"
                value={d}
                checked={direction === d}
                onChange={() => setDirection(d)}
              />
              {d === 'GRANT' ? '지급' : '차감'}
            </label>
          ))}
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor={amountId} className="text-xs font-medium text-[var(--fg-secondary)]">포인트</label>
          <input
            ref={amountRef}
            id={amountId}
            type="number"
            inputMode="numeric"
            min={1}
            max={POINT_ADJUST_MAX}
            step={1}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? `${amountHintId} ${amountErrorId}` : amountHintId}
            className={`tnum ${inputClass}`}
          />
          <p id={amountHintId} className="text-[11px] text-[var(--fg-muted)]">한 번에 최대 {won(POINT_ADJUST_MAX)}</p>
          {errors.amount && <p id={amountErrorId} className="text-[12px] text-accent">{errors.amount}</p>}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={noteId} className="text-xs font-medium text-[var(--fg-secondary)]">사유</label>
          <input
            ref={noteRef}
            id={noteId}
            type="text"
            maxLength={POINT_ADJUST_NOTE_MAX}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            aria-invalid={errors.note ? true : undefined}
            aria-describedby={errors.note ? `${noteHintId} ${noteErrorId}` : noteHintId}
            className={inputClass}
          />
          <p id={noteHintId} className="text-[11px] text-[var(--fg-muted)]">
            손님 적립금 내역에 그대로 보입니다. 예: 배송 지연 보상
          </p>
          {errors.note && <p id={noteErrorId} className="text-[12px] text-accent">{errors.note}</p>}
        </div>

        {!confirming && (
          <button
            type="submit"
            className="h-10 self-start rounded-sm border border-[var(--border-strong)] px-4 text-[13px] text-[var(--fg)]"
          >
            확인
          </button>
        )}
      </fieldset>

      {confirming && (
        <div role="group" aria-label={`포인트 ${verb} 확인`} className="flex flex-col gap-3 rounded-sm border border-[var(--border-strong)] p-4">
          <p id={summaryId} className="text-[13px] leading-relaxed">
            <b>{userName}</b>님에게 <b className="tnum">{won(value)}</b>를 {verb}합니다.
            <span className="tnum block text-[var(--fg-secondary)]">
              잔액 {won(balance)} → {won(after)} · 사유 “{note.trim()}”
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              ref={confirmRef}
              type="button"
              onClick={() => void submit()}
              disabled={pending}
              aria-describedby={summaryId}
              className="h-10 rounded-sm bg-[var(--brand)] px-4 text-[13px] font-medium text-[var(--bg)] disabled:opacity-60"
            >
              {pending ? `${verb}하는 중…` : `${verb}하기`}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="h-10 px-3 text-[13px] text-[var(--fg-secondary)]"
            >
              고치기
            </button>
          </div>
        </div>
      )}

      {/* 늘 있는 알림 영역 — 새로 생기는 영역은 화면 낭독기가 놓친다 */}
      <p role="status" className="text-[13px] text-success">{done}</p>
      {failure && <p role="alert" className="text-[13px] text-accent">{failure}</p>}
    </form>
  );
}
