'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import type { SizeFit } from '@shop/core';
import { useT } from '~/lib/i18n/client';
import { TrackedLink as Link } from '~/components/tracked-link';
import {
  BodyFields, ContentField, PhotoField, RatingField, SizeFitField,
  type ExistingPhoto,
} from '~/components/review-fields';

export interface EditableReview {
  readonly id: string;
  readonly rating: number;
  readonly content: string;
  readonly sizeFit: SizeFit | null;
  readonly height: number | null;
  readonly weight: number | null;
  readonly images: readonly ExistingPhoto[];
}

/**
 * 리뷰 수정 폼.
 *
 * **쓴 그대로를 채워 두고 시작한다.** 빈 폼을 주고 다시 쓰게 하면 한 글자를 고치려던 사람이 글 전체를 잃는다.
 *
 * 사진은 남길 것을 보낸다. 서버가 "뺄 것" 을 받으면 다른 탭에서 먼저 한 장을 뺐을 때 엉뚱한 사진이 지워진다.
 */
export function ReviewEditForm({ review }: { review: EditableReview }) {
  const router = useRouter();
  const t = useT();
  const [rating, setRating] = useState(review.rating);
  const [content, setContent] = useState(review.content);
  const [sizeFit, setSizeFit] = useState<SizeFit | ''>(review.sizeFit ?? '');
  const [height, setHeight] = useState(review.height === null ? '' : String(review.height));
  const [weight, setWeight] = useState(review.weight === null ? '' : String(review.weight));
  const [kept, setKept] = useState<string[]>(review.images.map((image) => image.id));
  const [added, setAdded] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const fields = {
        rating,
        content,
        sizeFit: sizeFit || null,
        height: height ? Number(height) : null,
        weight: weight ? Number(weight) : null,
        // 사진이 하나도 없던 글에 아무것도 더하지 않았으면 이 칸 자체를 보내지 않는다
        ...(review.images.length > 0 ? { keepImageIds: kept } : {}),
      };

      // 새로 올릴 사진이 없으면 JSON 그대로 — 작성 창구와 같은 두 갈래다
      const response = added.length === 0
        ? await fetch(`/api/reviews/${review.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(fields),
          })
        : await fetch(`/api/reviews/${review.id}`, {
            method: 'PATCH',
            body: (() => {
              const form = new FormData();
              form.set('data', JSON.stringify(fields));
              for (const file of added) form.append('images', file);
              return form;
            })(),
          });

      const data = (await response.json()) as { message?: string };
      if (!response.ok) {
        setError(data.message ?? t('review.saveFailed'));
        return;
      }

      /*
       * 목록으로 돌아가며 결과를 주소에 싣는다. 이 화면에 "저장했습니다" 를 띄우고 머물면, 고친 글이 목록에 어떻게
       * 보이는지는 여전히 안 보인다 — 등록 뒤 처리와 같은 결이다.
       */
      router.replace('/mypage/reviews?edited=1', { scroll: false });
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={(e) => submit(e)} noValidate className="flex flex-col gap-5">
      <RatingField value={rating} onChange={setRating} />
      <ContentField value={content} onChange={setContent} />
      <PhotoField
        existing={review.images}
        kept={kept}
        onKept={setKept}
        files={added}
        onFiles={setAdded}
        onError={setError}
      />
      <SizeFitField value={sizeFit} onChange={setSizeFit} />
      <BodyFields height={height} weight={weight} onHeight={setHeight} onWeight={setWeight} />

      {error && <p role="alert" className="text-[12px] text-accent">{error}</p>}

      <div className="flex items-center gap-4">
        <Button type="submit" size="md" disabled={pending || rating === 0 || content.trim().length < 10}>
          {pending ? t('review.saving') : t('review.save')}
        </Button>
        <Link href="/mypage/reviews" className="text-[13px] text-[var(--fg-muted)] underline underline-offset-2">
          {t('common.cancel')}
        </Link>
      </div>
    </form>
  );
}
