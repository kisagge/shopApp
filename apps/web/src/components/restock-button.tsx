'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 재입고 알림 신청.
 *
 * 품절된 옵션을 고른 순간에만 보여 준다. 살 수 없는 화면에서 할 수 있는
 * 일이 아무것도 없으면 사람은 그냥 떠난다.
 *
 * 비로그인은 막지 않고 로그인으로 보낸다 — 알림은 계정에 매이는 기능이라
 * 로그인이 자연스러운 다음 걸음이다.
 */
export function RestockButton({
  variantId,
  optionLabel,
  subscribed,
  loggedIn,
}: {
  variantId: string;
  optionLabel: string;
  subscribed: boolean;
  loggedIn: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [on, setOn] = useState(subscribed);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle() {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    const next = !on;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/restock/${variantId}`, {
        method: next ? 'PUT' : 'DELETE',
      });
      if (!response.ok) {
        const body = (await response.json()) as { message?: string };
        setMessage(body.message ?? t('restock.failed'));
        return;
      }
      setOn(next);
      setMessage(
        next
          ? t('restock.subscribed')
          : t('restock.unsubscribed'),
      );
    } catch {
      setMessage(t('common.networkError'));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="secondary"
        block
        disabled={pending}
        onClick={() => toggle()}
        // 상태를 색으로만 알리지 않는다. 이름 자체가 지금 무엇이 되는지 말한다.
        aria-label={
          on
            ? t('restock.offNamed', { option: optionLabel })
            : t('restock.onNamed', { option: optionLabel })
        }
      >
        {pending ? t('restock.pending') : on ? t('restock.off') : t('restock.on')}
      </Button>
      {/* 결과를 소리로도 알린다. 버튼 글자만 바뀌면 눌렀는지 알기 어렵다. */}
      <p aria-live="polite" className="text-[12px] leading-relaxed text-[var(--fg-muted)]">
        {message}
      </p>
    </div>
  );
}
