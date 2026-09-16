'use client';

import { useState } from 'react';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 마케팅 정보 수신 동의를 켜고 끈다.
 *
 * **철회할 길이 없으면 동의가 아니다.** 가입 화면에서 받은 선택 동의를 되돌릴 자리가 여기다 — 이용 기록 수집 토글과
 * 나란히 둔다. 다만 그쪽과 달리 이 값은 **계정의 것**이라 서버에 저장한다. 기기를 바꿔도 따라와야 하고, 메일을 보내는
 * 쪽은 브라우저가 아니라 서버다.
 */
export function MarketingConsentToggle({ initial }: { initial: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  async function toggle(): Promise<void> {
    const next = !on;
    setPending(true);
    setFailure(null);
    try {
      const response = await fetch('/api/account/consent', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ marketing: next }),
      });
      if (!response.ok) {
        setFailure(t('my.marketingFailed'));
        return;
      }
      setOn(next);
    } catch {
      setFailure(t('my.marketingFailed'));
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="marketing-title" className="mt-8 border-t border-[var(--border)] pt-5">
      <h2 id="marketing-title" className="text-[13px] font-semibold">{t('my.marketing')}</h2>
      <p className="mt-1.5 max-w-[60ch] text-[12px] leading-relaxed text-[var(--fg-muted)]">
        {t('my.marketingNote')}
      </p>

      <div className="mt-3 flex items-center gap-3">
        {/* 지금 상태를 색이 아니라 글로 말한다 */}
        <span className="text-[12px] text-[var(--fg-secondary)]" aria-live="polite">
          {t(on ? 'my.marketingOn' : 'my.marketingOff')}
        </span>
        <Button type="button" size="sm" variant="secondary" onClick={() => void toggle()} disabled={pending}>
          {t(on ? 'my.marketingStop' : 'my.marketingStart')}
        </Button>
      </div>

      {failure && <p role="alert" className="mt-2 text-[12px] text-accent">{failure}</p>}
    </section>
  );
}
