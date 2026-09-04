'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ANSWER_MAX_LENGTH } from '@shop/core';

/**
 * 대기줄에서 바로 답한다.
 *
 * 목록에서 상품 화면으로 옮겨 다니게 하면 한 건 처리할 때마다 두 번
 * 이동한다. 대기줄은 처리하는 자리이지 찾아보는 자리가 아니다.
 */
export function InquiryAnswerForm({
  inquiryId,
  productName,
}: {
  inquiryId: string;
  productName: string;
}) {
  const router = useRouter();
  const answerId = useId();

  const [answer, setAnswer] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/inquiries/${inquiryId}/answer`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ answer: answer.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? '등록하지 못했습니다.');
        return;
      }
      router.refresh();
    } catch {
      setError('네트워크 오류로 등록하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <label htmlFor={answerId} className="text-[11px] font-medium text-[var(--fg-secondary)]">
        {productName} 문의 답변
      </label>
      <textarea
        id={answerId}
        rows={3}
        value={answer}
        onChange={(event) => setAnswer(event.target.value)}
        maxLength={ANSWER_MAX_LENGTH}
        className="rounded-sm border border-n-300 bg-[var(--bg)] p-3 text-[13px]"
      />
      {error && (
        <span role="alert" className="text-[12px] text-accent">
          {error}
        </span>
      )}
      <button
        type="submit"
        disabled={answer.trim().length === 0 || pending}
        className="h-9 self-start rounded-sm bg-[var(--brand)] px-3.5 text-[12px] font-medium text-[var(--bg)] disabled:opacity-40"
      >
        {pending ? '등록 중…' : '답변 등록'}
      </button>
    </form>
  );
}
