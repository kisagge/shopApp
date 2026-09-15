'use client';

import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ORDER_NOTE_MAX } from '@shop/core';

export interface OrderNoteItem {
  readonly id: string;
  readonly body: string;
  /** ISO 문자열. 서버 컴포넌트에서 Date 를 넘기지 않는다 */
  readonly createdAt: string;
  readonly authorName: string;
  readonly merchantName: string | null;
  readonly deletable: boolean;
}

const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Seoul',
});

/**
 * 주문 내부 메모 — 목록과 남기기.
 *
 * **누가 읽는지를 칸 곁에 적는다.** 손님은 못 보고, 운영진 메모는 가맹점이 못 보고, 가맹점 메모는 운영진도 본다. 모르고
 * 쓰면 가맹점은 운영진이 못 볼 줄 알고, 운영진은 가맹점에게 전하려던 말을 아무도 안 읽는 곳에 남긴다.
 *
 * 남기면 칸을 비우고 목록을 다시 읽는다. 폼은 남으므로 결과는 늘 있는 알림 영역에 적는다. 지우기는 한 번 더 묻는다 —
 * 되돌릴 수 없다.
 */
export function OrderNotes({
  orderNo,
  notes,
  audience,
}: {
  orderNo: string;
  notes: readonly OrderNoteItem[];
  /** 이 사람이 남긴 메모를 누가 읽는가 */
  audience: 'staff' | 'merchant';
}) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const fieldId = useId();
  const hintId = useId();
  const errorId = useId();
  const countId = useId();
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  async function add() {
    if (body.trim() === '') {
      setError('메모를 입력해 주세요.');
      fieldRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNo)}/notes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? '메모를 남기지 못했습니다.');
        return;
      }
      setBody('');
      setStatus('메모를 남겼습니다.');
      router.refresh();
    } catch {
      setError('네트워크 오류로 메모를 남기지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  async function remove(id: string) {
    setPending(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(orderNo)}/notes/${id}`, { method: 'DELETE' });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? '메모를 지우지 못했습니다.');
        return;
      }
      setConfirmingId(null);
      setStatus('메모를 지웠습니다.');
      // 지운 줄의 단추가 사라진다 — 초점을 입력 칸으로 옮겨 문서 처음으로 튀지 않게
      fieldRef.current?.focus();
      router.refresh();
    } catch {
      setError('네트워크 오류로 메모를 지우지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {notes.length === 0 ? (
        <p className="text-[13px] text-[var(--fg-muted)]">남긴 메모가 없습니다.</p>
      ) : (
        <ol aria-label="메모 목록" className="flex flex-col divide-y divide-[var(--surface-2)]">
          {notes.map((n) => {
            const when = timeFormat.format(new Date(n.createdAt));
            return (
              <li key={n.id} className="flex flex-col gap-1.5 py-3 first:pt-0">
                <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] text-[var(--fg-muted)]">
                  <span className="font-medium text-[var(--fg-secondary)]">{n.authorName}</span>
                  <span>{n.merchantName ?? '운영진'}</span>
                  <time dateTime={n.createdAt} className="tnum">{when}</time>
                </p>
                <p className="whitespace-pre-wrap break-words text-[13px] leading-relaxed">{n.body}</p>
                {n.deletable && (
                  confirmingId === n.id ? (
                    <div role="group" aria-label={`${when} 메모 삭제 확인`} className="flex items-center gap-2 text-[12px]">
                      <span>되돌릴 수 없습니다. 지울까요?</span>
                      <button
                        type="button"
                        onClick={() => void remove(n.id)}
                        disabled={pending}
                        className="h-8 rounded-sm bg-accent px-2.5 font-medium text-[var(--bg)] disabled:opacity-60"
                      >
                        지우기
                      </button>
                      <button type="button" onClick={() => setConfirmingId(null)} disabled={pending} className="h-8 px-2 text-[var(--fg-secondary)]">
                        취소
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(n.id)}
                      aria-label={`${when} 메모 삭제`}
                      className="self-start text-[12px] text-[var(--fg-muted)] underline underline-offset-2"
                    >
                      삭제
                    </button>
                  )
                )}
              </li>
            );
          })}
        </ol>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
        className="flex flex-col gap-1.5 border-t border-[var(--surface-2)] pt-4"
      >
        <label htmlFor={fieldId} className="text-xs font-medium text-[var(--fg-secondary)]">메모 남기기</label>
        <textarea
          ref={fieldRef}
          id={fieldId}
          rows={3}
          maxLength={ORDER_NOTE_MAX}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-invalid={error && body.trim() === '' ? true : undefined}
          aria-describedby={[hintId, countId, error ? errorId : null].filter(Boolean).join(' ')}
          className="w-full rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] leading-relaxed"
        />
        <p id={hintId} className="text-[11px] text-[var(--fg-muted)]">
          {audience === 'staff'
            ? '손님에게는 보이지 않습니다. 운영진 메모는 가맹점에게도 보이지 않습니다.'
            : '손님에게는 보이지 않습니다. 가맹점 메모는 운영진도 봅니다.'}
        </p>
        <p id={countId} className="tnum text-right text-[11px] text-[var(--fg-muted)]">
          {body.length.toLocaleString('ko-KR')} / {ORDER_NOTE_MAX.toLocaleString('ko-KR')}자
        </p>
        {error && <p id={errorId} role="alert" className="text-[12px] text-accent">{error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="h-9 self-start rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)] disabled:opacity-60"
        >
          {pending ? '남기는 중…' : '메모 남기기'}
        </button>
        <p role="status" className="text-[12px] text-success">{status}</p>
      </form>
    </div>
  );
}
