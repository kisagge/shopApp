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
  variant = 'plain',
}: {
  productId: string;
  productName: string;
  initialWishlisted: boolean;
  loggedIn: boolean;
  size?: 'sm' | 'md';
  /**
   * 어디에 얹히는가.
   *
   * **사진 위에 뜰 때(`floating`)는 테마를 타지 않는다.** 상품 사진은 밝든
   * 어둡든 그 사진이라, 그 위의 알약은 늘 밝아야 읽힌다.
   *
   * **글 사이에 설 때(`plain`)는 테마를 탄다.** 상세 화면의 이 단추는
   * 사진이 아니라 화면 바탕 위에 있는데, 늘 밝게 두었더니 어두운 화면에서
   * 흰 동그라미로 떴다 — 바로 옆 공유 단추는 테마를 타고 있어서, 둘이
   * 나란히 서서 서로 다른 화면에서 온 것처럼 보였다.
   */
  variant?: 'plain' | 'floating';
}) {
  const t = useT();
  const router = useRouter();
  const [wishlisted, setWishlisted] = useState(initialWishlisted);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const box = size === 'md' ? 'h-11 w-11 text-[20px]' : 'h-9 w-9 text-[16px]';

  const skin =
    variant === 'floating'
      ? 'border-n-900/12 bg-n-0/85 backdrop-blur-sm hover:bg-n-0'
      : 'border-[var(--border-strong)] hover:bg-[var(--surface)]';
  // 사진 위에서는 늘 밝은 알약 위라 진하게, 글 사이에서는 옆의 공유 단추와 같게
  const glyph = variant === 'floating' ? 'text-n-600' : 'text-[var(--fg-secondary)]';

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
        className={`flex items-center justify-center rounded-full border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)] disabled:opacity-60 ${skin} ${box}`}
      >
        <span aria-hidden="true" className={wishlisted ? 'text-accent' : glyph}>
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
