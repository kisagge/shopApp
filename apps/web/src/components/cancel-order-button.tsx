'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';

/**
 * 주문 취소.
 *
 * 되돌릴 수 없는 동작이라 한 번 더 묻는다. 사유를 필수로 받는 이유는
 * 감사 로그에 남기기 위해서다 — 나중에 "왜 취소됐지" 를 답할 수 있어야 한다.
 */
export function CancelOrderButton({ orderNo }: { orderNo: string }) {
  const t = useT();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState(t('cancel.defaultReason'));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  /**
   * **눌리는 것을 막지 않으므로 여기서 막는다.**
   *
   * `Button` 은 disabled 대신 aria-disabled 를 쓴다 — 못 누르는 버튼은 초점을 못 받아
   * 왜 못 누르는지 들리지 않기 때문이고, 그 판단은 옳다. 대신 **눌리기는 하므로 조건을
   * 핸들러가 지켜야 한다**(주문 만들기가 같은 까닭으로 같은 처방을 쓴다).
   *
   * 안 지키고 있었다. 보내는 동안 세 번 누르면 취소가 **세 번** 나갔다. 첫 요청이 주문을
   * 취소하고 나머지는 "이미 취소된 주문" 으로 거절되므로 돈이 두 번 돌아가지는 않지만,
   * 방금 취소에 성공한 사람 화면에 빨간 실패 문구가 뜬다 — 자기가 누른 것이 안 된 줄 안다.
   *
   * state 가 아니라 ref 로 본다. 빠른 두 번 누름은 리액트가 다시 그리기 전에 둘 다
   * `pending === false` 를 읽을 수 있고, 그러면 막은 적이 없는 것과 같다.
   */
  const sending = useRef(false);

  async function cancel() {
    if (sending.current) return;
    sending.current = true;
    setError(null);
    setPending(true);

    /*
     * **길이 끊기는 것도 끝이다.** try 가 없어서, 지하철에서 누른 사람의 버튼은
     * '취소 중…' 인 채로 영영 남았다 — 아무 말도 없이. 위의 ref 가 생기면서 그 자리는
     * 다시 눌러 볼 수도 없는 자리가 되므로 함께 닫는다. 쿠폰함·문의가 같은 처방을 쓴다.
     */
    try {
      const res = await fetch(`/api/orders/${orderNo}/cancel`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || t('cancel.defaultReason') }),
      });

      if (!res.ok) {
        // 502 가 HTML 을 돌려주면 json() 이 터진다 — 그것까지 네트워크 오류로 뭉뚱그리지 않는다
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? t('cancel.failed'));
        return;
      }
      setConfirming(false);
      router.refresh();
    } catch {
      setError(t('common.networkError'));
    } finally {
      setPending(false);
      sending.current = false;
    }
  }

  if (!confirming) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="danger" block onClick={() => setConfirming(true)}>
          {t('cancel.button')}
        </Button>
        {error && (
          <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-sm border border-accent p-4">
      <p className="text-[13px] font-semibold">{t('cancel.confirm')}</p>
      <p className="text-xs leading-relaxed text-[var(--fg-secondary)]">
        {t('cancel.note')}
      </p>
      <label htmlFor="cancel-reason" className="text-xs font-medium">
        {t('cancel.reason')}
      </label>
      <input
        id="cancel-reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        className="h-11 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-3 text-[13px]"
      />
      {error && (
        <p role="alert" className="rounded-sm bg-accent-soft px-3 py-2.5 text-[13px] text-accent-hover">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        {/*
          **왜 못 누르는지 말한다.** 취소를 보내는 동안 이 버튼도 잠기는데,
          옆의 버튼은 이름이 '취소 중…' 으로 바뀌어 스스로 설명하는 반면
          이쪽은 '돌아가기' 그대로다. 낭독기에는 "돌아가기, 사용 불가" 만
          들리고 왜인지는 어디에도 없었다.
        */}
        <Button
          variant="secondary"
          block
          onClick={() => setConfirming(false)}
          aria-disabled={pending}
          aria-describedby={pending ? 'cancel-busy' : undefined}
        >
          {t('cancel.back')}
        </Button>
        <Button variant="accent" block onClick={() => cancel()} aria-disabled={pending}>
          {pending ? t('cancel.pending') : t('cancel.button')}
        </Button>
      </div>
      {pending && (
        <p id="cancel-busy" className="sr-only">
          {t('common.busyWait')}
        </p>
      )}
    </div>
  );
}
