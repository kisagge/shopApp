'use client';

import { useEffect } from 'react';
import { Button } from '@shop/ui';
import { useT } from '~/lib/i18n/client';
import { reportClientError } from '~/components/error-reporter';

/**
 * 운영 화면 하나가 깨졌을 때.
 *
 * **여기 있는 이유는 사이드바다.**
 *
 * 오류 경계는 가장 가까운 것이 잡는다. 이 파일이 없으면 루트 경계가 잡고,
 * 그러면 어드민 레이아웃까지 통째로 대체된다 — 메뉴가 사라져 운영진은
 * 주소를 직접 치거나 뒤로 가기를 눌러야 다른 일을 이어 갈 수 있다.
 *
 * 이 파일은 admin/layout 안쪽에서 잡으므로 **메뉴는 그대로 남는다.** 깨진
 * 것은 오른쪽 한 칸뿐이고, 운영진은 다른 메뉴로 넘어가면 된다.
 *
 * 문구도 그래서 다르다. 루트는 "다시 시도해 보시고" 라고만 하지만 여기서는
 * 다른 메뉴가 살아 있다는 것을 알려 준다 — 화면이 그렇게 보이더라도 말해
 * 주지 않으면 모른다.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();

  useEffect(() => {
    /*
     * **운영 화면이 깨진 것도 원장에 남긴다.**
     *
     * 콘솔에만 적고 있었다. 손님 쪽 경계는 같은 자리에서 원장으로 보내고, 그
     * 까닭도 적혀 있다 — 서버 오류는 instrumentation 이 받지만 **브라우저에서
     * 난 것은 우리가 보내지 않으면 아무도 모르고**, React 가 잡은 오류는
     * window 의 error 까지 올라오지 않아 ErrorReporter 도 못 듣는다. 그 사정은
     * 운영 화면에서도 똑같은데 여기만 빠져 있었다(왜 빼는지 적힌 데도 없었다).
     *
     * 빠져 있으면 운영진이 "이 화면이 안 열린다" 고 말해 줄 때까지 아무 기록이
     * 없다. 손님 쪽과 달리 **운영진은 적게 쓰고 넘어가는 일이 많아** 그 말을
     * 안 하면 끝이다.
     */
    console.error('[admin-error]', error.digest ?? '(digest 없음)', error);
    reportClientError(error, '운영 화면을 그리다 오류가 났습니다');
  }, [error]);

  return (
    <div className="flex flex-col items-start gap-4 rounded-md border border-[var(--border)] bg-[var(--bg)] p-8">
      <h1 className="text-lg font-semibold">{t('error.adminHeading')}</h1>
      <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        {t('error.adminNote')}
      </p>

      {error.digest && (
        <p className="tnum rounded-sm bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--fg-muted)]">
          {t('error.digest', { digest: error.digest })}
        </p>
      )}

      {/*
        여기서는 다시 시도가 맞다. 운영 화면은 대부분 읽기이고, 쓰기는 각
        폼이 자기 오류를 따로 다룬다 — 결제 화면과 다른 점이다.
      */}
      <Button type="button" onClick={reset}>
        {t('common.retry')}
      </Button>
    </div>
  );
}
