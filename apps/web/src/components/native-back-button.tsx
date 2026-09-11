'use client';

import { useEffect, useRef, useState } from 'react';
import { exitApp, isNativeShell, onBackButton } from '@shop/native';
import { useT } from '~/lib/i18n/client';

/** 두 번째 누름을 기다리는 시간. 짧으면 못 누르고, 길면 실수로 닫힌다. */
const CONFIRM_MS = 2_000;

/**
 * 안드로이드 뒤로 가기.
 *
 * **첫 화면에서 한 번 누르면 앱이 그냥 닫혔다.** 되돌릴 곳이 없으면
 * Capacitor 가 바로 앱을 끝내기 때문인데, 목록을 보다 무심코 누른 사람에게
 * 그것은 사고에 가깝다. 한 번 더 물어본다.
 *
 * **되돌릴 곳이 있으면 되돌린다.** 여기에 귀를 붙이는 순간 기본 동작이
 * 사라지므로, 그 몫까지 우리가 해야 한다 — 안 그러면 앱 안에서 뒤로 가기가
 * 아무 일도 안 하게 된다.
 *
 * 브라우저에는 이 단추가 없다. iOS 도 마찬가지이고, 애초에 앱이 스스로
 * 닫는 것을 허용하지 않는다.
 */
export function NativeBackButton() {
  const t = useT();
  const [asking, setAsking] = useState(false);
  /** 언제까지가 "한 번 더" 인가. 상태로 두면 리스너가 옛 값을 본다. */
  const untilRef = useRef(0);

  useEffect(() => {
    if (!isNativeShell()) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const stop = onBackButton((canGoBack) => {
      if (canGoBack) {
        window.history.back();
        return;
      }

      if (Date.now() < untilRef.current) {
        exitApp();
        return;
      }

      untilRef.current = Date.now() + CONFIRM_MS;
      setAsking(true);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => setAsking(false), CONFIRM_MS);
    });

    return () => {
      stop();
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (!asking) return null;

  return (
    /*
     * 화면 아래에 잠깐 띄운다. 이 말은 어느 한 칸에 대한 것이 아니라 앱
     * 전체에 대한 것이라, 입력칸 옆이 아니라 화면 가장자리가 맞다.
     * role=status 라 낭독기가 하던 말을 끊지 않는다.
     */
    <p
      role="status"
      className="safe-b fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-4"
    >
      <span className="rounded-full bg-[var(--brand)] px-4 py-2.5 text-[13px] text-[var(--bg)] shadow-lg">
        {t('nav.exitHint')}
      </span>
    </p>
  );
}
