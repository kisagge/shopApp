'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import {
  SIZE_FIT, SIZE_FIT_LABEL, RATING_MAX, MAX_IMAGES_PER_REVIEW, MAX_IMAGE_BYTES,
  IMAGE_CONTENT_TYPE, type SizeFit,
} from '@shop/core';

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
        setError(data.message ?? '리뷰를 저장하지 못했습니다.');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('네트워크 오류로 저장하지 못했습니다.');
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-sm bg-success-soft px-4 py-3 text-[13px] text-success">
        리뷰를 등록했습니다. 감사합니다.
      </p>
    );
  }

  return (
    <form onSubmit={(e) => submit(e)} noValidate className="flex flex-col gap-5">
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend id={groupId} className="text-xs font-medium text-[var(--fg-secondary)]">
          별점
          <span className="ml-1 text-accent" aria-hidden="true">*</span>
          <span className="sr-only"> (필수)</span>
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
              <span className="sr-only">{value}점</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor={contentId} className="text-xs font-medium text-[var(--fg-secondary)]">
          후기
          <span className="ml-1 text-accent" aria-hidden="true">*</span>
          <span className="sr-only"> (필수)</span>
        </label>
        <textarea
          id={contentId} value={content} onChange={(e) => setContent(e.target.value)}
          rows={5} maxLength={2000} required
          placeholder="소재, 착용감, 사이즈처럼 다음 사람에게 도움이 될 내용을 적어 주세요."
          className="rounded-sm border border-n-300 bg-[var(--bg)] px-3.5 py-3 text-sm"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          <span className="tnum">{content.trim().length}</span> / 10자 이상
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={imagesId} className="text-xs font-medium text-[var(--fg-secondary)]">
          사진 (선택)
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
              setError(`사진은 ${MAX_IMAGES_PER_REVIEW}장까지 올릴 수 있습니다.`);
              return;
            }
            const tooBig = picked.find((f) => f.size > MAX_IMAGE_BYTES);
            if (tooBig) {
              // 여기서 막는 것은 편의다. 진짜 한도는 서버가 다시 본다.
              setError('사진 한 장은 5MB 를 넘을 수 없습니다.');
              return;
            }
            setError(null);
            setImages(picked);
          }}
          className="text-[13px] file:mr-3 file:h-9 file:rounded-sm file:border file:border-n-300 file:bg-[var(--surface)] file:px-3 file:text-[13px]"
        />
        <p className="text-[11px] text-[var(--fg-muted)]">
          최대 {MAX_IMAGES_PER_REVIEW}장 · 한 장당 5MB · JPEG · PNG · WebP · AVIF
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
                  alt={`고른 사진 ${i + 1}`}
                  className="h-20 w-20 rounded-sm border border-[var(--border)] object-cover"
                />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, at) => at !== i))}
                  aria-label={`고른 사진 ${i + 1} 빼기`}
                  className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-n-900 text-[11px] text-n-0"
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-xs font-medium text-[var(--fg-secondary)]">사이즈는 어땠나요? (선택)</legend>
        <div className="flex gap-2">
          {SIZE_FIT.map((fit) => (
            <label
              key={fit}
              className={`flex h-10 cursor-pointer items-center rounded-sm border px-4 text-[13px] ${
                sizeFit === fit ? 'border-n-900 bg-n-900 text-n-0' : 'border-n-300'
              }`}
            >
              <input
                type="radio" name="sizeFit" value={fit} className="sr-only"
                checked={sizeFit === fit}
                onChange={() => setSizeFit(fit)}
              />
              {SIZE_FIT_LABEL[fit]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap gap-4 border-0 p-0">
        <legend className="mb-2 text-xs font-medium text-[var(--fg-secondary)]">
          체형 (선택) — 사이즈 판단에 도움이 됩니다
        </legend>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={heightId} className="text-[11px] text-[var(--fg-muted)]">키 (cm)</label>
          <input
            id={heightId} type="number" inputMode="numeric" min={100} max={250}
            value={height} onChange={(e) => setHeight(e.target.value)}
            className="tnum h-10 w-24 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={weightId} className="text-[11px] text-[var(--fg-muted)]">몸무게 (kg)</label>
          <input
            id={weightId} type="number" inputMode="numeric" min={20} max={300}
            value={weight} onChange={(e) => setWeight(e.target.value)}
            className="tnum h-10 w-24 rounded-sm border border-n-300 bg-[var(--bg)] px-2.5 text-[13px]"
          />
        </div>
      </fieldset>

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      <div>
        <Button type="submit" size="md" disabled={pending || rating === 0 || content.trim().length < 10}>
          {pending ? '등록 중…' : '리뷰 등록'}
        </Button>
      </div>
    </form>
  );
}
