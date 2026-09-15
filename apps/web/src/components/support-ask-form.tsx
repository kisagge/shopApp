'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  IMAGE_CONTENT_TYPE, INQUIRY_MAX_LENGTH, INQUIRY_TOPIC, MAX_IMAGE_BYTES, MAX_IMAGES_PER_INQUIRY, type InquiryTopic,
} from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { TOPIC_KEY } from '~/lib/i18n/support';
import { failureMessage } from '~/lib/client/failure-message';

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
export function SupportAskForm({ photosEnabled = false }: { photosEnabled?: boolean }) {
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
  /** 첨부할 사진. 불량·오배송은 글보다 사진이 빠르다 */
  const [images, setImages] = useState<File[]>([]);
  const imagesId = useId();
  const imagesHintId = useId();
  // 고른 파일의 미리보기 주소. 바뀌거나 사라지면 풀어 준다 — 안 풀면 브라우저가 파일을 계속 쥐고 있다
  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    try {
      const fields = { topic, content: content.trim(), isPrivate };
      // 사진이 있으면 multipart(`data` 에 JSON), 없으면 JSON — 리뷰와 같은 모양
      const response = images.length === 0
        ? await fetch('/api/inquiries', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fields),
          })
        : await fetch('/api/inquiries', {
            method: 'POST',
            body: (() => {
              const form = new FormData();
              form.append('data', JSON.stringify(fields));
              for (const file of images) form.append('images', file);
              return form;
            })(),
          });

      if (!response.ok) {
        setError(await failureMessage(response, t('support.submit')));
        return;
      }

      setContent('');
      setImages([]);
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

      {photosEnabled && (
        <div className="flex flex-col gap-2">
          <label htmlFor={imagesId} className="text-[13px] font-medium">{t('support.photos')}</label>
          <input
            id={imagesId}
            type="file"
            multiple
            // accept 는 고르는 창을 좁힐 뿐이다 — 실제 검사는 서버가 파일 앞부분으로 한다
            accept={IMAGE_CONTENT_TYPE.join(',')}
            aria-describedby={imagesHintId}
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (images.length + picked.length > MAX_IMAGES_PER_INQUIRY) {
                setError(t('support.photoLimit', { max: MAX_IMAGES_PER_INQUIRY }));
                e.target.value = '';
                return;
              }
              if (picked.some((f) => f.size > MAX_IMAGE_BYTES)) {
                setError(t('review.photoSize'));
                e.target.value = '';
                return;
              }
              setError(null);
              setImages((prev) => [...prev, ...picked]);
              // 같은 파일을 지웠다가 다시 고를 수 있게 비운다
              e.target.value = '';
            }}
            className="text-[13px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--surface)] file:px-3 file:text-[13px]"
          />
          <p id={imagesHintId} className="text-[12px] text-[var(--fg-muted)]">
            {t('support.photoHint', { max: MAX_IMAGES_PER_INQUIRY })}
          </p>
          {previews.length > 0 && (
            <ul aria-label={t('support.photosPicked')} className="flex flex-wrap gap-2">
              {previews.map((url, i) => (
                <li key={url} className="relative">
                  {/* blob: 미리보기라 서버가 가져올 수 없다 — next/image 를 쓸 수 없는 자리 */}
                  <img src={url} alt={t('review.pickedPhoto', { index: i + 1 })} className="h-20 w-20 rounded-sm border border-[var(--border)] object-cover" />
                  <button
                    type="button"
                    onClick={() => setImages((prev) => prev.filter((_, at) => at !== i))}
                    aria-label={t('review.removePhoto', { index: i + 1 })}
                    className="absolute -top-1.5 -right-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-[var(--brand)] text-[12px] text-[var(--bg)]"
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
