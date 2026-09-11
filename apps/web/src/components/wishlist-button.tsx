'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { track } from '~/lib/analytics/client';
import { useT } from '~/lib/i18n/client';

/**
 * 찜 버튼.
 *
 * 상태를 색과 모양으로만 알리면 안 된다. 하트가 찼는지 비었는지는 눈으로만
 * 보이므로, **버튼 이름 자체를 상태에 따라 바꾼다** — "찜하기" / "찜 해제".
 * 그러면 스크린리더가 지금 무엇을 누르는지도, 지금 어떤 상태인지도 함께 읽는다.
 * aria-pressed 를 쓰지 않은 이유는 이름이 이미 상태를 말하기 때문이다 —
 * 둘 다 두면 "찜 해제, 눌림" 처럼 겹쳐 읽힌다.
 *
 * 비로그인은 막지 않고 로그인으로 보낸다. 누르지도 못하게 두면 왜 안 되는지
 * 알 수 없고, 찜은 계정에 매이는 기능이라 로그인이 자연스러운 다음 걸음이다.
 */
export function WishlistButton({
  productId,
  productName,
  initialWishlisted,
  loggedIn,
  size = 'sm',
}: {
  productId: string;
  productName: string;
  initialWishlisted: boolean;
  loggedIn: boolean;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const box = size === 'md' ? 'h-11 w-11 text-[20px]' : 'h-9 w-9 text-[16px]';

  async function toggle() {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !wishlisted;
    // 먼저 바꾸고 나중에 되돌린다. 찜은 누르는 순간 반응해야 하는 종류의 조작이다.
    setWishlisted(next);
    setPending(true);
    setError(null);

    try {
      const response = await fetch(`/api/wishlist/${productId}`, {
        method: next ? 'PUT' : 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json()) as { message?: string };
        setWishlisted(!next);
        setError(data.message ?? t('common.failed'));
        return;
      }
      if (next) track('add_to_wishlist', { productId });
      router.refresh();
    } catch {
      setWishlisted(!next);
      setError(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => toggle()}
        disabled={pending}
        aria-label={
          wishlisted
            ? t('wish.remove', { name: productName })
            : t('wish.add', { name: productName })
        }
        className={`flex items-center justify-center rounded-full border border-n-900/12 bg-n-0/85 backdrop-blur-sm transition-colors hover:bg-n-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-60 ${box}`}
      >
        {/*
          **알약이 늘 밝다**(사진 위에 떠야 해서). 그 위의 하트가 n-400 이라
          2.44:1 이었다 — 찜하는 단추인지 알아보기 어려웠다. 알약이 테마를
          안 타므로 글자도 안 타는 값으로 두되, 읽히는 쪽으로 내린다.
        */}
        <span aria-hidden="true" className={wishlisted ? 'text-accent' : 'text-n-600'}>
          {wishlisted ? '♥' : '♡'}
        </span>
      </button>
      {error && (
        <span role="alert" className="sr-only">
          {error}
        </span>
      )}
    </>
  );
}
