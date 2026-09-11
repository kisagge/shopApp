'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { INQUIRY_MAX_LENGTH, INQUIRY_TOPIC, type InquiryTopic } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { TOPIC_KEY } from '~/lib/i18n/support';

/**
 * 고객센터 1:1 문의.
 *
 * 상품 문의와 **같은 창구로 보낸다** — 답하는 사람도 대기줄도 같다. 다른
 * 것은 상품 대신 갈래를 고른다는 점뿐이다.
 *
 * 기본을 **비공개로 둔다.** 상품 문의는 같은 것을 궁금해하는 사람이 있어
 * 공개가 기본이지만, 배송·결제·계정 문의는 주문번호나 사는 곳을 적게 되고
 * 그것이 남에게 보일 이유가 없다.
 */
export function SupportAskForm() {
  const router = useRouter();
  const t = useT();
  const topicId = useId();
  const contentId = useId();
  const privateId = useId();

  const [topic, setTopic] = useState<InquiryTopic>('DELIVERY');
  const [content, setContent] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topic, content: content.trim(), isPrivate }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { message?: string };
        setError(data.message ?? t('support.submit'));
        return;
      }

      setContent('');
      setSent(true);
      router.refresh();
    } catch {
      setError(t('support.submit'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor={topicId} className="text-[13px] font-medium">
          {t('support.topic')}
        </label>
        <select
          id={topicId}
          value={topic}
          onChange={(e) => setTopic(e.target.value as InquiryTopic)}
          className="h-11 w-full max-w-64 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[14px]"
        >
          {INQUIRY_TOPIC.map((value) => (
            <option key={value} value={value}>
              {t(TOPIC_KEY[value])}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={contentId} className="text-[13px] font-medium">
          {t('support.content')}
        </label>
        <textarea
          id={contentId}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={7}
          required
          minLength={5}
          maxLength={INQUIRY_MAX_LENGTH}
          className="w-full rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] p-3 text-[14px] leading-relaxed"
        />
        <p className="tnum text-right text-[11px] text-[var(--fg-muted)]">
          {content.length} / {INQUIRY_MAX_LENGTH}
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={privateId} className="flex items-center gap-2 text-[13px]">
          <input
            id={privateId}
            type="checkbox"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4"
          />
          {t('support.private')}
        </label>
        <p className="pl-6 text-[12px] text-[var(--fg-muted)]">{t('support.privateHint')}</p>
      </div>

      {error && (
        <p role="alert" className="text-[13px] text-accent">
          {error}
        </p>
      )}

      {/* 보냈다는 사실은 눈에만 보이면 안 된다 */}
      <p role="status" className="text-[13px] text-success">
        {sent ? t('support.sent') : ''}
      </p>

      <button
        type="submit"
        disabled={pending || content.trim().length < 5}
        className="h-12 w-full max-w-64 rounded-sm bg-[var(--brand)] text-sm font-medium text-[var(--bg)] disabled:opacity-40"
      >
        {t('support.submit')}
      </button>
    </form>
  );
}
