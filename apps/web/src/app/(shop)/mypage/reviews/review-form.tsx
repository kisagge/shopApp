'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import {
  SIZE_FIT, RATING_MAX, MAX_IMAGES_PER_REVIEW, MAX_IMAGE_BYTES,
  IMAGE_CONTENT_TYPE, type SizeFit,
} from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { SIZE_FIT_KEY } from '~/lib/i18n/enum-labels';

export interface ReviewTarget {
  readonly orderItemId: string;
  readonly productName: string;
  readonly brandName: string;
  readonly optionLabel: string;
  readonly imageUrl: string | null;
}

/**
 * 리뷰 작성 폼.
 *
 * 별점은 라디오 그룹이다. 별 모양 버튼을 클릭 이벤트로만 다루면 키보드로
 * 고를 수 없고 현재 값도 읽히지 않는다. 라디오는 화살표 키로 옮겨 다닐 수
 * 있고 선택 상태를 스스로 알린다.
 */
export function ReviewForm({ target }: { target: ReviewTarget }) {
  const router = useRouter();
  const t = useT();
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState('');
  const [sizeFit, setSizeFit] = useState<SizeFit | ''>('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  /**
   * 미리보기 주소는 브라우저가 들고 있는 자원이다.
   *
   * createObjectURL 로 만든 것은 revoke 하지 않으면 페이지를 떠날 때까지
   * 남는다. 사진을 여러 번 골라 보면 그만큼 쌓인다.
   *
   * 상태로 두지 않고 파생시킨다. 이펙트 안에서 setState 로 채우면 고를
   * 때마다 렌더가 한 번 더 돌고, 그 사이 한 프레임은 미리보기가 비어 있다.
   * 이펙트는 **직전 묶음을 되돌리는 일만** 한다.
   */
  const previews = useMemo(() => images.map((file) => URL.createObjectURL(file)), [images]);
  useEffect(
    () => () => { for (const url of previews) URL.revokeObjectURL(url); },
    [previews],
  );

  const contentId = useId();
  const imagesId = useId();
  const heightId = useId();
  const weightId = useId();
  const groupId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const fields = {
        orderItemId: target.orderItemId,
        rating,
        content,
        sizeFit: sizeFit || null,
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
      };

      /**
       * 사진이 없으면 JSON 그대로 보낸다.
       *
       * 사진 없는 리뷰가 대부분인데 그쪽까지 multipart 로 바꾸면 이유 없이
       * 무거워진다. 서버도 두 가지를 모두 받는다.
       */
      const response = images.length === 0
        ? await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fields),
          })
        : await fetch('/api/reviews', {
            method: 'POST',
            body: (() => {
              const form = new FormData();
              form.set('data', JSON.stringify(fields));
              for (const file of images) form.append('images', file);
              return form;
            })(),
          });
      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? t('review.saveFailed'));
        return;
      }
      setDone(true);
      /*
       * **결과를 주소에 싣고 화면을 다시 받는다.** 새로 고치기만 하면 방금 쓴 상품이 목록에서 빠지면서 이 폼과 함께 "리뷰를
       * 등록했습니다" 가 곧바로 사라진다 — 마지막 한 개였으면 "쓸 수 있는 상품이 없습니다" 만 남아 등록이 된 건지 모른다.
       * 낭독기는 읽기도 전에 사라진 알림을 말하지 않는다. 화면(page)이 주소를 보고 같은 말을 남긴다.
       */
      router.replace('/mypage/reviews?saved=1', { scroll: false });
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  // 등록이 끝나면 폼을 거둔다. 결과 문구는 화면이 주소(saved=1)를 보고 한 번만 남긴다 — 둘 다 말하면 낭독기가 두 번 읽는다
  if (done) return null;

  return (
    <form onSubmit={(e) => submit(e)} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend id={groupId} className="text-xs font-medium text-[var(--fg-secondary)]">
          {t('review.rating')}
          <span className="ml-1 text-accent" aria-hidden="true">*</span>
          <span className="sr-only"> {t('review.required')}</span>
        </legend>
        <div className="flex gap-1">
          {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((value) => (
            <label
              key={value}
              className="cursor-pointer text-[26px] leading-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]"
            >
              <input
                type="radio" name="rating" value={value} className="sr-only"
                checked={rating === value}
                onChange={() => setRating(value)}
              />
              <span aria-hidden="true" className={value <= rating ? 'text-warning-graphic' : 'text-n-300'}>
                ★
              </span>
              <span className="sr-only">{t('review.starCount', { rating: value })}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={contentId} className="text-xs font-medium text-[var(--fg-secondary)]">
          {t('review.body')}
          <span className="ml-1 text-accent" aria-hidden="true">*</span>
          <span className="sr-only"> {t('review.required')}</span>
        </label>
        <textarea
          id={contentId} value={content} onChange={(e) => setContent(e.target.value)}
          rows={5} maxLength={2000} required
          placeholder={t('review.bodyPlaceholder')}
          className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3.5 py-3 text-sm"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          <span className="tnum">{content.trim().length}</span> {t('review.minLength')}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={imagesId} className="text-xs font-medium text-[var(--fg-secondary)]">
          {t('review.photos')}
        </label>
        <input
          id={imagesId}
          type="file"
          multiple
          /**
           * accept 는 파일 선택 창을 좁혀 줄 뿐 강제가 아니다.
           * 실제 검사는 서버가 파일 앞부분의 매직 바이트로 한다.
           */
          accept={IMAGE_CONTENT_TYPE.join(',')}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            if (picked.length > MAX_IMAGES_PER_REVIEW) {
              setError(t('review.photoLimit', { max: MAX_IMAGES_PER_REVIEW }));
              return;
            }
            const tooBig = picked.find((f) => f.size > MAX_IMAGE_BYTES);
            if (tooBig) {
              // 여기서 막는 것은 편의다. 진짜 한도는 서버가 다시 본다.
              setError(t('review.photoSize'));
              return;
            }
            setError(null);
            setImages(picked);
          }}
          className="text-[13px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-[var(--border-strong)] file:bg-[var(--surface)] file:px-3 file:text-[13px]"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          {t('review.photoHint', { max: MAX_IMAGES_PER_REVIEW })}
        </p>

        {previews.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2">
            {previews.map((url, i) => (
              <li key={url} className="relative">
                {/*
                  방금 고른 파일의 미리보기다. 주소가 blob: 이라 브라우저
                  안에만 있고 서버가 가져올 수 없다 — next/image 를 쓸 수
                  없는 유일한 자리다. 어차피 네트워크로 나가지 않는다.
                */}
                <img
                  src={url}
                  alt={t('review.pickedPhoto', { index: i + 1 })}
                  className="h-20 w-20 rounded-sm border border-[var(--border)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, at) => at !== i))}
                  aria-label={t('review.removePhoto', { index: i + 1 })}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-[11px] text-[var(--bg)]"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-xs font-medium text-[var(--fg-secondary)]">
          {t('review.sizeAsk')}
        </legend>
        <div className="flex gap-2">
          {SIZE_FIT.map((fit) => (
            <label
              key={fit}
              className={`flex h-10 cursor-pointer items-center rounded-sm border px-4 text-[13px] ${
                sizeFit === fit ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--bg)]' : 'border-[var(--border-strong)]'
              }`}
            >
              <input
                type="radio" name="sizeFit" value={fit} className="sr-only"
                checked={sizeFit === fit}
                onChange={() => setSizeFit(fit)}
              />
              {t(SIZE_FIT_KEY[fit])}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap gap-4 border-0 p-0">
        <legend className="mb-2 text-xs font-medium text-[var(--fg-secondary)]">
          {t('review.bodyInfo')}
        </legend>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={heightId} className="text-[11px] text-[var(--fg-muted)]">
            {t('review.height')}
          </label>
          <input
            id={heightId} type="number" inputMode="numeric" min={100} max={250}
            value={height} onChange={(e) => setHeight(e.target.value)}
            className="tnum h-10 w-24 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={weightId} className="text-[11px] text-[var(--fg-muted)]">
            {t('review.weight')}
          </label>
          <input
            id={weightId} type="number" inputMode="numeric" min={20} max={300}
            value={weight} onChange={(e) => setWeight(e.target.value)}
            className="tnum h-10 w-24 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
          />
        </div>
      </fieldset>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      <div>
        <Button type="submit" size="md" disabled={pending || rating === 0 || content.trim().length < 10}>
          {pending ? t('review.posting') : t('review.post')}
        </Button>
      </div>
    </form>
  );
}
