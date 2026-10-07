'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 끝난 알림을 사람이 닫는다.
 *
 * **운영 알림함은 할 일 목록이라 열었다고 끝난 것이 아니다.** 한동안 이 화면을 한 번 열면 안 읽은 것이
 * 전부 읽음이 됐다 — 그러면 뱃지의 숫자는 "할 일이 몇 개" 가 아니라 "들여다봤는가" 가 되고, 아직
 * 처리하지 않은 일은 목록을 훑어 기억하는 수밖에 없다. 매장 알림함은 소식을 전하는 자리라 지금도
 * 열면 읽음이 된다 — 거기서는 그것이 맞다.
 *
 * **무엇을 닫는지 이름에 담는다.** 줄마다 "읽음" 단추가 선 목록에서 낭독기는 "읽음, 단추" 를 열 번
 * 읽는다 — 어느 줄의 것인지 모르면 누를 수 없다.
 *
 * 실패하면 **그 자리에 말한다.** 조용히 아무 일도 안 일어나면 사람은 한 번 더 누르고, 그래도 안 되면
 * 이 단추가 원래 그런 줄 안다.
 */
export function MarkReadButton({
  ids,
  label,
  variant = 'row',
}: {
  /** 닫을 줄. 비어 있으면 그릴 것이 없다 */
  readonly ids: readonly string[];
  /** 낭독기가 읽을 이름. "코트 재고가 3개 남았습니다 읽음 처리" 처럼 무엇을 닫는지가 들어간다 */
  readonly label: string;
  readonly variant?: 'row' | 'all';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);

  if (ids.length === 0) return null;

  const onClick = () => {
    setFailed(false);
    startTransition(async () => {
      try {
        const res = await fetch('/api/notifications/read?box=console', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids: [...ids] }),
        });
        if (!res.ok) throw new Error(String(res.status));
        // 목록을 다시 받아야 점과 뱃지가 함께 바뀐다 — 한쪽만 바뀌면 숫자가 거짓이 된다
        router.refresh();
      } catch {
        setFailed(true);
      }
    });
  };

  return (
    <span className="flex shrink-0 items-center gap-2">
      {failed && (
        <span role="alert" className="text-[11px] text-accent">
          처리하지 못했습니다
        </span>
      )}
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        aria-label={label}
        className={
          variant === 'all'
            ? 'inline-flex h-9 shrink-0 items-center rounded-sm border border-[var(--border-strong)] px-3 text-[13px] text-[var(--fg)] hover:bg-[var(--surface)] disabled:opacity-60'
            : 'inline-flex h-8 shrink-0 items-center rounded-sm border border-[var(--border)] px-2.5 text-[12px] text-[var(--fg-secondary)] hover:bg-[var(--surface)] hover:text-[var(--fg)] disabled:opacity-60'
        }
      >
        {pending ? '처리 중…' : variant === 'all' ? '모두 읽음' : '읽음'}
      </button>
    </span>
  );
}
