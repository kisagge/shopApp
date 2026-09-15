'use client';

import { useId, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { REVIEW_REPLY_MAX } from '@shop/core';

/**
 * 리뷰 판매자 답글 — 쓰기·고치기·지우기.
 *
 * **손님에게 공개로 보이는 말**이라 쓰기 전에 그렇게 적어 둔다. 처음 답하면 쓴 사람에게 알림이 가고, 고치면 "수정됨"
 * 이 붙는다. 지우기는 한 번 더 묻는다 — 되돌릴 수 없고, 쓴 사람은 이미 알림으로 봤을 수 있다.
 */
export function ReviewReplyForm({
  reviewId,
  productName,
  reply,
}: {
  reviewId: string;
  productName: string;
  reply: string | null;
}) {
  const router = useRouter();
  const ids = { box: useId(), hint: useId(), title: useId() };
  /*
   * 지금 걸린 답. 저장이 끝나면 여기서 바꾼다 — 화면을 새로 받아 다시 그리면(새 key) 결과 안내가 함께 사라져, 누른
   * 사람은 저장됐는지 모른다.
   */
  const [current, setCurrent] = useState(reply);
  const [editing, setEditing] = useState(reply === null);
  const [text, setText] = useState(reply ?? '');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  async function send(method: 'PUT' | 'DELETE') {
    setPending(true);
    setError(null);
    setStatus('');
    try {
      const response = await fetch(`/api/admin/reviews/${reviewId}/reply`, {
        method,
        headers: { 'content-type': 'application/json' },
        ...(method === 'PUT' ? { body: JSON.stringify({ reply: text }) } : {}),
      });
      const body = (await response.json().catch(() => ({}))) as { message?: string; fields?: Record<string, string> };
      if (!response.ok) {
        setError(body.fields?.['reply'] ?? body.message ?? '답글을 저장하지 못했습니다.');
        return;
      }
      if (method === 'DELETE') {
        setCurrent(null);
        setText('');
        setEditing(true);
        setConfirmingDelete(false);
        setStatus('답글을 지웠습니다.');
      } else {
        setEditing(false);
        setStatus(current === null ? '답글을 달았습니다. 리뷰를 쓴 분에게 알림이 갑니다.' : '답글을 고쳤습니다.');
        setCurrent(text.trim());
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim() === '') {
      setError('답글을 입력해 주세요.');
      return;
    }
    void send('PUT');
  }

  return (
    <section aria-labelledby={ids.title} className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
      <h3 id={ids.title} className="text-[12px] font-semibold text-[var(--fg-secondary)]">판매자 답글</h3>

      {!editing && current !== null ? (
        <>
          <p className="whitespace-pre-wrap rounded-sm bg-[var(--surface)] px-3 py-2 text-[13px] leading-relaxed">{current}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { setEditing(true); setText(current); setStatus(''); }}
              className="h-9 rounded-sm border border-[var(--border-strong)] px-3 text-[12px]"
            >
              답글 고치기
            </button>
            {confirmingDelete ? (
              <>
                <button
                  type="button"
                  onClick={() => void send('DELETE')}
                  disabled={pending}
                  className="h-9 rounded-sm bg-accent px-3 text-[12px] font-medium text-[var(--bg)] disabled:opacity-60"
                >
                  {pending ? '지우는 중…' : '답글 지우기 확인'}
                </button>
                <button type="button" onClick={() => setConfirmingDelete(false)} className="h-9 px-2 text-[12px] text-[var(--fg-secondary)]">
                  취소
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="h-9 px-2 text-[12px] text-[var(--fg-secondary)] underline underline-offset-2"
              >
                답글 지우기
              </button>
            )}
          </div>
        </>
      ) : (
        <form onSubmit={onSubmit} aria-labelledby={ids.title} className="flex flex-col gap-2">
          <label htmlFor={ids.box} className="sr-only">{productName} 리뷰에 남길 답글</label>
          <textarea
            id={ids.box}
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            rows={3}
            maxLength={REVIEW_REPLY_MAX}
            aria-describedby={ids.hint}
            aria-invalid={error ? true : undefined}
            className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 py-2 text-[13px] leading-relaxed"
          />
          <p id={ids.hint} className="text-[11px] text-[var(--fg-muted)]">
            상품 화면에 판매자 답글로 공개됩니다. 1,000자까지.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="h-9 rounded-sm bg-[var(--brand)] px-4 text-[12px] font-medium text-[var(--bg)] disabled:opacity-60"
            >
              {pending ? '저장 중…' : current === null ? '답글 달기' : '답글 저장'}
            </button>
            {current !== null && (
              <button type="button" onClick={() => { setEditing(false); setError(null); }} className="h-9 px-2 text-[12px] text-[var(--fg-secondary)]">
                취소
              </button>
            )}
          </div>
        </form>
      )}
      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}
      <p role="status" className="text-[12px] text-[var(--fg-muted)]">{status}</p>
    </section>
  );
}
