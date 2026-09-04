'use client';

import { useEffect } from 'react';
import { Button } from '@shop/ui';

/**
 * 화면 하나가 깨졌을 때.
 *
 * **digest 를 보여 준다.** 사용자에게는 의미 없는 문자열이지만, 문의가
 * 들어왔을 때 이 값으로 로그의 그 요청을 정확히 찾을 수 있다. 없으면
 * "안 된다" 는 말과 시각만 가지고 뒤져야 한다.
 *
 * 원인은 적지 않는다. 오류 메시지에는 내부 구조가 그대로 드러나는 일이 흔하다.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 서버 오류는 instrumentation 이 받는다. 이건 브라우저에서 난 것이다.
    console.error('[client-error]', error.digest ?? '(digest 없음)', error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-5 px-4 py-24 text-center">
      <h1 className="font-serif text-2xl font-medium tracking-tight">화면을 불러오지 못했습니다</h1>
      <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        일시적인 문제일 수 있습니다. 다시 시도해 보시고, 계속되면 아래 번호와 함께 문의해 주세요.
      </p>
      {error.digest && (
        <p className="tnum rounded-sm bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--fg-muted)]">
          오류 번호 {error.digest}
        </p>
      )}
      <Button type="button" onClick={reset}>다시 시도</Button>
    </div>
  );
}
