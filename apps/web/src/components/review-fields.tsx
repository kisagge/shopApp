'use client';

import { useEffect, useId, useMemo } from 'react';
import Image from 'next/image';
import {
  SIZE_FIT, RATING_MAX, MAX_IMAGES_PER_REVIEW, MAX_IMAGE_BYTES,
  IMAGE_CONTENT_TYPE, isBlurDataUrl, type SizeFit,
} from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { SIZE_FIT_KEY } from '~/lib/i18n/enum-labels';

/**
 * 리뷰를 쓸 때와 고칠 때 **같은 칸을 쓴다.**
 *
 * 처음에는 작성 폼 안에 다 들어 있었는데, 고치는 화면을 만들면서 별점·후기·사진·체형이 통째로 한 벌 더 필요해졌다. 베껴 두면
 * 두 화면이 서서히 갈라진다 — 한쪽에만 글자 수 안내를 고치는 식으로. 그래서 칸을 꺼내 두 폼이 끼워 쓴다.
 */

/** 별점. 라디오 그룹이다 — 클릭 이벤트로만 다루면 키보드로 고를 수 없고 현재 값도 읽히지 않는다 */
export function RatingField({
  value,
  onChange,
  name = 'rating',
}: {
  value: number;
  onChange: (rating: number) => void;
  name?: string;
}) {
  const t = useT();

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="text-xs font-medium text-[var(--fg-secondary)]">
        {t('review.rating')}
        <span className="ml-1 text-accent" aria-hidden="true">*</span>
        <span className="sr-only"> {t('review.required')}</span>
      </legend>
      <div className="flex gap-1">
        {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((star) => (
          <label
            key={star}
            className="cursor-pointer text-[26px] leading-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)]"
          >
            <input
              type="radio" name={name} value={star} className="sr-only"
              checked={value === star}
              onChange={() => onChange(star)}
            />
            <span aria-hidden="true" className={star <= value ? 'text-warning-graphic' : 'text-n-300'}>
              ★
            </span>
            <span className="sr-only">{t('review.starCount', { rating: star })}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 후기 본문. 10자 이상 */
export function ContentField({ value, onChange }: { value: string; onChange: (content: string) => void }) {
  const t = useT();
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-xs font-medium text-[var(--fg-secondary)]">
        {t('review.body')}
        <span className="ml-1 text-accent" aria-hidden="true">*</span>
        <span className="sr-only"> {t('review.required')}</span>
      </label>
      <textarea
        id={id} value={value} onChange={(e) => onChange(e.target.value)}
        rows={5} maxLength={2000} required
        placeholder={t('review.bodyPlaceholder')}
        className="rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3.5 py-3 text-sm"
      />
      <p className="text-[11px] text-[var(--fg-muted)]">
        <span className="tnum">{value.trim().length}</span> {t('review.minLength')}
      </p>
    </div>
  );
}

export interface ExistingPhoto {
  readonly id: string;
  readonly url: string;
  readonly blurDataUrl: string | null;
}

/**
 * 사진.
 *
 * 고칠 때는 **이미 올라간 사진과 새로 고른 사진이 한 자리에** 있어야 한다. 따로 두면 "다섯 장까지" 라는 한도가 어느 쪽 얘기인지
 * 알 수 없다. 남길지 말지는 체크박스로 받는다 — 지우는 단추로 두면 잘못 눌렀을 때 되돌릴 길이 저장 취소밖에 없다.
 */
export function PhotoField({
  existing = [],
  kept,
  onKept,
  files,
  onFiles,
  onError,
}: {
  existing?: readonly ExistingPhoto[];
  /** 남기기로 한 사진 id. 고치는 화면에서만 쓴다 */
  kept?: readonly string[];
  onKept?: (ids: string[]) => void;
  files: readonly File[];
  onFiles: (files: File[]) => void;
  onError: (message: string | null) => void;
}) {
  const t = useT();
  const id = useId();

  const keptIds = kept ?? existing.map((photo) => photo.id);

  /**
   * 미리보기 주소는 브라우저가 들고 있는 자원이다.
   *
   * createObjectURL 로 만든 것은 revoke 하지 않으면 페이지를 떠날 때까지 남는다. 사진을 여러 번 골라 보면 그만큼 쌓인다.
   *
   * 상태로 두지 않고 파생시킨다. 이펙트 안에서 setState 로 채우면 고를 때마다 렌더가 한 번 더 돌고, 그 사이 한 프레임은
   * 미리보기가 비어 있다. 이펙트는 **직전 묶음을 되돌리는 일만** 한다.
   */
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(
    () => () => { for (const url of previews) URL.revokeObjectURL(url); },
    [previews],
  );

  return (
    <div className="flex flex-col gap-2">
      {existing.length > 0 && (
        <fieldset className="flex flex-col gap-2 border-0 p-0">
          <legend className="text-xs font-medium text-[var(--fg-secondary)]">
            {t('review.currentPhotos')}
          </legend>
          <ul className="flex flex-wrap gap-3">
            {existing.map((photo, i) => {
              const checked = keptIds.includes(photo.id);
              return (
                <li key={photo.id} className="flex flex-col items-center gap-1.5">
                  <Image
                    src={photo.url}
                    alt={t('review.currentPhoto', { index: i + 1 })}
                    width={80} height={80}
                    {...(isBlurDataUrl(photo.blurDataUrl)
                      ? { placeholder: 'blur' as const, blurDataURL: photo.blurDataUrl }
                      : {})}
                    className={`h-20 w-20 rounded-sm border border-[var(--border)] object-cover ${
                      checked ? '' : 'opacity-40'
                    }`}
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-[var(--fg-secondary)]">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        onError(null);
                        onKept?.(
                          e.target.checked
                            ? // 원래 차례를 지킨다 — 누른 순서대로 쌓으면 사진이 뒤섞인다
                              existing.filter((p) => p.id === photo.id || keptIds.includes(p.id)).map((p) => p.id)
                            : keptIds.filter((keptId) => keptId !== photo.id),
                        );
                      }}
                    />
                    {t('review.keepPhoto', { index: i + 1 })}
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <label htmlFor={id} className="text-xs font-medium text-[var(--fg-secondary)]">
        {existing.length > 0 ? t('review.addPhotos') : t('review.photos')}
      </label>
      <input
        id={id}
        type="file"
        multiple
        /**
         * accept 는 파일 선택 창을 좁혀 줄 뿐 강제가 아니다.
         * 실제 검사는 서버가 파일 앞부분의 매직 바이트로 한다.
         */
        accept={IMAGE_CONTENT_TYPE.join(',')}
        onChange={(e) => {
          const picked = Array.from(e.target.files ?? []);
          // 이미 올라간 사진과 함께 센다 — 한도는 리뷰 한 건의 사진 수다
          if (picked.length + keptIds.length > MAX_IMAGES_PER_REVIEW) {
            onError(t('review.photoLimit', { max: MAX_IMAGES_PER_REVIEW }));
            return;
          }
          const tooBig = picked.find((f) => f.size > MAX_IMAGE_BYTES);
          if (tooBig) {
            // 여기서 막는 것은 편의다. 진짜 한도는 서버가 다시 본다.
            onError(t('review.photoSize'));
            return;
          }
          onError(null);
          onFiles(picked);
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
                방금 고른 파일의 미리보기다. 주소가 blob: 이라 브라우저 안에만 있고 서버가 가져올 수 없다 —
                next/image 를 쓸 수 없는 유일한 자리다. 어차피 네트워크로 나가지 않는다.
              */}
              <img
                src={url}
                alt={t('review.pickedPhoto', { index: i + 1 })}
                className="h-20 w-20 rounded-sm border border-[var(--border)] object-cover"
              />
              <button
                type="button"
                onClick={() => onFiles(files.filter((_, at) => at !== i))}
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
  );
}

/** 사이즈 감상 */
export function SizeFitField({
  value,
  onChange,
  name = 'sizeFit',
}: {
  value: SizeFit | '';
  onChange: (fit: SizeFit) => void;
  name?: string;
}) {
  const t = useT();

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="text-xs font-medium text-[var(--fg-secondary)]">{t('review.sizeAsk')}</legend>
      <div className="flex gap-2">
        {SIZE_FIT.map((fit) => (
          <label
            key={fit}
            className={`flex h-10 cursor-pointer items-center rounded-sm border px-4 text-[13px] ${
              value === fit ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--bg)]' : 'border-[var(--border-strong)]'
            }`}
          >
            <input
              type="radio" name={name} value={fit} className="sr-only"
              checked={value === fit}
              onChange={() => onChange(fit)}
            />
            {t(SIZE_FIT_KEY[fit])}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** 체형 — 사이즈 판단에 실제로 도움이 되는 값이다. 선택 사항 */
export function BodyFields({
  height,
  weight,
  onHeight,
  onWeight,
}: {
  height: string;
  weight: string;
  onHeight: (value: string) => void;
  onWeight: (value: string) => void;
}) {
  const t = useT();
  const heightId = useId();
  const weightId = useId();

  return (
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
          value={height} onChange={(e) => onHeight(e.target.value)}
          className="tnum h-10 w-24 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={weightId} className="text-[11px] text-[var(--fg-muted)]">
          {t('review.weight')}
        </label>
        <input
          id={weightId} type="number" inputMode="numeric" min={20} max={300}
          value={weight} onChange={(e) => onWeight(e.target.value)}
          className="tnum h-10 w-24 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2.5 text-[13px]"
        />
      </div>
    </fieldset>
  );
}
