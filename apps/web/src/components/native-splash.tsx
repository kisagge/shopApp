'use client';

import { useEffect } from 'react';
import { hideSplash, isNativeShell } from '@shop/native';

/**
 * 시작 화면을 내린다.
 *
 * **셸이 화면을 네트워크로 받아 오기 때문에 필요하다.** 앱 안에 화면이 들어
 * 있는 것이 아니라 배포된 웹앱을 그대로 부르므로, 켜고 나서 첫 화면이
 * 그려지기까지 웹보다 오래 걸린다. 그 사이를 비워 두면 흰 화면이고,
 * 사용자는 앱이 멈춘 줄 안다.
 *
 * **여기서 내리는 이유는 이 자리가 "그려졌다" 를 아는 자리이기 때문이다.**
 * 효과는 첫 그리기가 끝난 뒤에 돈다. 설정에도 상한(launchShowDuration)이
 * 있지만 그건 이 신호가 영영 안 올 때를 위한 안전망이고, 웹이 먼저 오면
 * 그만큼 일찍 내리는 것이 맞다.
 *
 * 브라우저에서는 아무 일도 하지 않는다. 화면을 그리지 않으므로 하이드레이션에
 * 영향도 없다 — NativeSession 과 같은 모양이다.
 */
export function NativeSplash() {
  useEffect(() => {
    if (!isNativeShell()) return;
    void hideSplash();
  }, []);

  return null;
}
