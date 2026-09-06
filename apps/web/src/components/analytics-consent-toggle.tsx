'use client';

import { useSyncExternalStore } from 'react';
import { Button } from '@shop/ui';
import { getLocalConsent, setLocalConsent, subscribeConsent } from '~/lib/analytics/consent';
import { getTracker } from '~/lib/analytics/client';
import { useT } from '~/lib/i18n/client';

/**
 * 이용 기록 수집을 끄고 켠다.
 *
 * **거부할 길이 없으면 동의가 아니다.** 동의를 읽는 모듈은 진작 있었는데
 * 아무도 부르지 않았고, 그것을 바꿀 화면도 없었다 — 문서에는 "거부는 즉시
 * 존중한다" 고 적혀 있었는데 거부할 방법이 없었다.
 *
 * 서버에 저장하지 않는다. 이 값은 **이 브라우저의 것**이고, 로그인하지 않은
 * 사람도 끌 수 있어야 한다. 로그인한 사람의 계정 설정(DENIED)은 서버가
 * 따로 존중하며 그쪽이 우선한다.
 */
export function AnalyticsConsentToggle() {
  const t = useT();
  /*
   * 이 값은 브라우저에만 있다. 서버는 모르므로 처음 그릴 때 무엇이든 고르면
   * 하이드레이션이 어긋난다 — useSyncExternalStore 는 **서버 몫을 따로**
   * 받으므로 그 어긋남 없이 "아직 모른다" 를 그릴 수 있다. 이펙트에서
   * setState 하는 것보다 렌더도 한 번 덜 부른다.
   */
  const granted = useSyncExternalStore<boolean | null>(
    subscribeConsent,
    getLocalConsent,
    // 서버 몫. 아직 모른다.
    () => null,
  );

  function toggle() {
    const next = !(granted ?? true);
    setLocalConsent(next);
    // 끄는 순간 큐에 남은 것도 보내지 않는다
    if (!next) getTracker().discard();
  }

  return (
    <section aria-labelledby="analytics-title" className="mt-10 border-t border-[var(--border)] pt-5">
      <h2 id="analytics-title" className="text-[13px] font-semibold">
        {t('my.analytics')}
      </h2>
      <p className="mt-1.5 max-w-[60ch] text-[12px] leading-relaxed text-[var(--fg-muted)]">
        {t('my.analyticsNote')}
      </p>

      <div className="mt-3 flex items-center gap-3">
        {/* 지금 상태를 색이 아니라 글로 말한다 */}
        <span className="text-[12px] text-[var(--fg-secondary)]" aria-live="polite">
          {granted === null ? ' ' : t(granted ? 'my.analyticsOn' : 'my.analyticsOff')}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={toggle} disabled={granted === null}>
          {t(granted === false ? 'my.analyticsStart' : 'my.analyticsStop')}
        </Button>
      </div>
    </section>
  );
}
