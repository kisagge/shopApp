'use client';

import { useState } from 'react';
import { nativeShare } from '@shop/native';
import { track } from '~/lib/analytics/client';
import { useT } from '~/lib/i18n/client';

/**
 * 상품 공유.
 *
 * **길이 셋인데 어느 것이 열려 있는지는 기기마다 다르다.** 앱 안에서는
 * 안드로이드 웹뷰가 navigator.share 를 아예 주지 않고, 브라우저에서는
 * 데스크톱 크롬이 최근에야 붙였다. 그래서 되는 것을 차례로 시도하고,
 * 마지막에는 **언제나 되는 것**(주소 복사)으로 떨어진다 — 눌렀는데 아무
 * 일도 없는 상태를 만들지 않는 것이 이 순서의 목적이다.
 *
 * 어느 길로 나갔는지는 이벤트에 남긴다. 시스템 시트로 나간 것과 주소를
 * 복사한 것은 뜻이 다르다 — 뒤엣것은 공유할 곳을 못 찾아 직접 옮긴 쪽에
 * 가깝다.
 *
 * **취소는 실패가 아니다.** 시트를 열었다가 닫으면 브라우저는 AbortError 를
 * 던지는데, 그걸 오류로 보여 주면 사용자는 자기가 뭘 잘못한 줄 안다.
 */
export function ShareButton({
  productId,
  productName,
  size = 'sm',
}: {
  productId: string;
  productName: string;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const [note, setNote] = useState<string | null>(null);

  const box = size === 'md' ? 'h-11 w-11 text-[18px]' : 'h-9 w-9 text-[15px]';

  async function share() {
    const url = window.location.href;
    setNote(null);

    // 1) 앱 안이면 시스템 시트. 웹뷰는 navigator.share 가 없을 수 있다.
    if (await nativeShare({ title: productName, url })) {
      track('share', { productId, method: 'native' });
      return;
    }

    // 2) 브라우저의 공유. 사용자가 닫아도 성공으로 본다.
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: productName, url });
        track('share', { productId, method: 'web' });
        return;
      } catch {
        // 취소했거나 이 기기가 이 내용을 못 보낸다. 아래로 떨어진다.
      }
    }

    // 3) 언제나 되는 길.
    try {
      await navigator.clipboard.writeText(url);
      setNote(t('product.shareCopied'));
      track('share', { productId, method: 'clipboard' });
    } catch {
      // 클립보드는 권한이 막히거나 http 에서는 아예 없다
      setNote(t('product.shareFailed'));
    }
  }

  return (
    <span className="inline-flex flex-col items-center">
      <button
        type="button"
        onClick={() => void share()}
        aria-label={t('product.share')}
        className={`${box} inline-flex items-center justify-center rounded-full border border-n-300 text-[var(--fg-secondary)] hover:text-[var(--fg)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2`}
      >
        {/*
          아이콘은 그림일 뿐이라 낭독기에서 숨긴다 — 이름은 aria-label 이 준다.
          currentColor 를 쓰므로 밝은 화면과 어두운 화면에서 함께 따라온다.
        */}
        <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" aria-hidden="true">
          <path
            d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3m0 0L8 7m4-4 4 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {/*
        결과는 status 로 알린다. alert 로 두면 낭독기가 하던 말을 끊는데,
        복사됐다는 말은 그렇게까지 급한 소식이 아니다.
      */}
      <span role="status" className="sr-only">
        {note}
      </span>
      {note && (
        <span aria-hidden="true" className="mt-1 text-[11px] whitespace-nowrap text-[var(--fg-muted)]">
          {note}
        </span>
      )}
    </span>
  );
}
