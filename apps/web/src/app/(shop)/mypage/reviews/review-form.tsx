'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import type { SizeFit } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import {
  BodyFields, ContentField, PhotoField, RatingField, SizeFitField,
} from '~/components/review-fields';

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
 * 칸은 고치는 화면과 함께 쓴다(review-fields). 여기 남은 것은 **처음 쓸 때만의 일** 뿐이다 — 어느 구매의 후기인지
 * 싣는 것, 등록하고 나서 폼을 거두는 것.
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
      const data = (await response.json()) as { message?: string; earnedPoints?: number };
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
      // 들어온 적립금은 결과 문구에 함께 싣는다 — 말없이 들어오면 잔액이 왜 늘었는지 모른다
      const earned = data.earnedPoints ?? 0;
      router.replace(earned > 0 ? `/mypage/reviews?saved=1&earned=${earned}` : '/mypage/reviews?saved=1', {
        scroll: false,
      });
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
      <RatingField value={rating} onChange={setRating} />
      <ContentField value={content} onChange={setContent} />
      <PhotoField files={images} onFiles={setImages} onError={setError} />
      <SizeFitField value={sizeFit} onChange={setSizeFit} />
      <BodyFields height={height} weight={weight} onHeight={setHeight} onWeight={setWeight} />

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      <div>
        <Button type="submit" size="md" disabled={pending || rating === 0 || content.trim().length < 10}>
          {pending ? t('review.posting') : t('review.post')}
        </Button>
      </div>
    </form>
  );
}
