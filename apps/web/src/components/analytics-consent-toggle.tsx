'use client';

import { useState, useSyncExternalStore } from 'react';
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
 * **계정에도 남긴다.** 예전에는 이 브라우저의 localStorage 만 건드렸다 — 기기나 브라우저를 바꾸면 껐던 추적이
 * 조용히 되살아났고, 수집 창구가 존중하는 계정 설정(DENIED)은 아무 데서도 만들어지지 않았다. 문서에는 "거부는
 * 즉시 존중한다" 고 적혀 있었는데 그 거부가 이 기기 밖으로 나가지 않았던 셈이다.
 *
 * **이 브라우저의 값도 함께 맞춘다.** 수집을 멈추는 것은 브라우저의 트래커이고, 서버에만 적으면 이미 쌓인 것을
 * 계속 보내다 창구에서 버려진다 — 보내지 않는 편이 낫다.
 */
export function AnalyticsConsentToggle({ initial }: { initial: boolean }) {
  const t = useT();
  /*
   * 이 값은 브라우저에만 있다. 서버는 모르므로 처음 그릴 때 무엇이든 고르면
   * 하이드레이션이 어긋난다 — useSyncExternalStore 는 **서버 몫을 따로**
   * 받으므로 그 어긋남 없이 "아직 모른다" 를 그릴 수 있다. 이펙트에서
   * setState 하는 것보다 렌더도 한 번 덜 부른다.
   */
  const local = useSyncExternalStore<boolean | null>(
    subscribeConsent,
    getLocalConsent,
    // 서버 몫. 이 브라우저의 값은 아직 모르지만 계정의 값은 안다
    () => initial,
  );
  /*
   * **계정의 값이 먼저다.** 이 기기에서 아직 고른 적이 없어도 다른 기기에서 껐다면 꺼진 것으로 보여야 한다.
   * 반대로 이 기기에서 끈 것은 아래 toggle 이 계정에도 적어 두므로 둘이 갈리지 않는다.
   */
  const granted = local === null ? initial : local && initial;
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    const next = !granted;
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch('/api/account/consent', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ analytics: next }),
      });
      if (!response.ok) {
        setFailure(t('my.analyticsFailed'));
        return;
      }
      setLocalConsent(next);
      // 끄는 순간 큐에 남은 것도 보내지 않는다
      if (!next) getTracker().discard();
    } catch {
      setFailure(t('my.analyticsFailed'));
    } finally {
      setPending(false);
    }
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
          {t(granted ? 'my.analyticsOn' : 'my.analyticsOff')}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void toggle()} disabled={pending}>
          {t(granted ? 'my.analyticsStop' : 'my.analyticsStart')}
        </Button>
      </div>

      {failure && <p role="alert" className="mt-2 text-[12px] text-accent">{failure}</p>}
    </section>
  );
}
