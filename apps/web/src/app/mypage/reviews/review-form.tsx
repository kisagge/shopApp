'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { SIZE_FIT, SIZE_FIT_LABEL, RATING_MAX, type SizeFit } from '@shop/core';

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
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const contentId = useId();
  const heightId = useId();
  const weightId = useId();
  const groupId = useId();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          orderItemId: target.orderItemId,
          rating,
          content,
          sizeFit: sizeFit || null,
          height: height ? Number(height) : null,
          weight: weight ? Number(weight) : null,
        }),
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
    <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-5">
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
