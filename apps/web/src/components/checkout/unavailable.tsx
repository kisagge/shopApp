'use client';
import { useT } from '~/lib/i18n/client';

/**
 * 결제를 치를 수 없을 때 폼 대신 서는 자리.
 *
 * **주문을 만들기 전에 멈추는 것이 요점이다.** 폼을 그대로 보여 주고 확정에서
 * 터뜨리면 주문만 남고 결제가 없는 상태가 된다 — 실제로 배포에서 그랬다
 * (20260910-7063897 이 입금대기로 남았다).
 *
 * 사람에게 설정 이야기를 하지 않는다. 키가 없다거나 게이트웨이가 어떻다는
 * 것은 여기 온 사람이 할 수 있는 일이 아니다. 이유는 서버 로그에 남는다.
 */
export function CheckoutUnavailable() {
  const t = useT();
  return (
    <div
      role="status"
      className="rounded-sm border border-[var(--border)] bg-[var(--surface)] px-5 py-10 text-center"
    >
      <p className="text-[15px] font-medium">{t('checkout.unavailable.heading')}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--fg-muted)]">
        {t('checkout.unavailable.body')}
      </p>
    </div>
  );
}
