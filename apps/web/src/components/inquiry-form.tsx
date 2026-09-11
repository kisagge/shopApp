'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INQUIRY_MAX_LENGTH } from '@shop/core';
import { useT } from '~/lib/i18n/client';

/**
 * 문의 작성.
 *
 * **비공개를 고를 수 있게 한다.** 사이즈를 물으며 체형을, 배송을 물으며
 * 사는 곳을 적는 일이 흔한데 그게 상품 페이지에 그대로 남으면 안 된다.
 * 기본은 공개다 — 같은 것을 궁금해하는 사람이 다시 묻지 않아도 되는 것이
 * 문의를 공개로 두는 이유다.
 */
export function InquiryForm({ productId }: { productId: string }) {
  const router = useRouter();
  const t = useT();
  const contentId = useId();
  const privateId = useId();

  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ productId, content: content.trim(), isPrivate }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? t('inq.postFailed'));
        return;
      }

      setContent('');
      setIsPrivate(false);
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 py-5">
      <label htmlFor={contentId} className="text-[13px] font-medium">
        {t('inq.ask')}
      </label>
      <textarea
        id={contentId}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={3}
        maxLength={INQUIRY_MAX_LENGTH}
        placeholder={t('inq.askPlaceholder')}
        className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px]"
      />

      <label htmlFor={privateId} className="flex items-center gap-2 text-[13px]">
        <input
          id={privateId}
          type="checkbox"
          checked={isPrivate}
          onChange={(event) => setIsPrivate(event.target.checked)}
        />
        {t('inq.askPrivate')}
        <span className="text-[12px] text-[var(--fg-muted)]">
          {t('inq.askPrivateHint')}
        </span>
      </label>

      {error && (
        <span role="alert" className="text-[12px] text-accent">
          {error}
        </span>
      )}

      <button
        type="submit"
        disabled={pending || content.trim().length < 5}
        className="h-11 self-start rounded-sm bg-[var(--brand)] px-5 text-[13px] font-medium text-[var(--bg)] disabled:opacity-40"
      >
        {pending ? t('inq.posting') : t('inq.post')}
      </button>
    </form>
  );
}
