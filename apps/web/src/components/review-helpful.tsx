'use client';

import { useState } from 'react';
import { useT } from '~/lib/i18n/client';
import { failureMessage } from '~/lib/client/failure-message';

/**
 * 도움이 됐다고 누르는 버튼.
 *
 * **누른 상태를 색이 아니라 이름으로 알린다.** `aria-pressed` 로 눌림을
 * 말하고, 접근성 이름에 지금 몇 명인지까지 넣는다 — 화면 낭독기 사용자에게
 * 숫자만 따로 읽히면 그것이 무엇의 숫자인지 알 수 없다.
 *
 * 숫자는 **서버가 돌려준 값으로 맞춘다.** 눌린 상태에서 1을 더하는 방식은
 * 다른 사람이 그 사이에 누른 것을 놓쳐, 새로고침할 때마다 숫자가 튄다.
 */
export function ReviewHelpful({
  reviewId,
  initialCount,
  initialPressed,
  canVote,
}: {
  reviewId: string;
  initialCount: number;
  initialPressed: boolean;
  /** 로그인했고 내 글이 아니어야 누를 수 있다 */
  canVote: boolean;
}) {
  const t = useT();
  const [count, setCount] = useState(initialCount);
  const [pressed, setPressed] = useState(initialPressed);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canVote) {
    /*
     * 누를 수 없는 사람에게도 **숫자는 보여 준다.** 표를 정렬 기준으로
     * 쓰면서 그 수를 감추면, 왜 이 리뷰가 위에 있는지 알 수 없다.
     */
    return (
      <span className="text-[11px] text-[var(--fg-muted)]">
        {t('review.helpfulCount', { count })}
      </span>
    );
  }

  async function toggle() {
    const next = !pressed;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/reviews/${reviewId}/helpful`, {
        method: next ? 'PUT' : 'DELETE',
      });
      if (!response.ok) {
        setError(await failureMessage(response, t('review.helpful')));
        return;
      }
      const data = (await response.json()) as { helpfulCount: number };
      setCount(data.helpfulCount);
      setPressed(next);
    } catch {
      setError(t('review.helpful'));
    } finally {
      setPending(false);
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={pending}
        aria-pressed={pressed}
        aria-label={t(pressed ? 'review.helpfulOn' : 'review.helpfulOff', { count })}
        className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] disabled:opacity-40 ${
          pressed
            ? 'border-[var(--fg)] font-medium text-[var(--fg)]'
            : 'border-[var(--border-strong)] text-[var(--fg-secondary)] hover:text-[var(--fg)]'
        }`}
      >
        {/* 아이콘은 장식이다 — 이름과 상태는 버튼이 말한다 */}
        <span aria-hidden="true">{pressed ? '♥' : '♡'}</span>
        <span aria-hidden="true">
          {t('review.helpful')} <span className="tnum">{count}</span>
        </span>
      </button>
      {error && (
        <span role="alert" className="text-[11px] text-accent">
          {error}
        </span>
      )}
    </span>
  );
}
