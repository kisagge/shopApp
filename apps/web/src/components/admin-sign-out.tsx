'use client';

import { useRouter } from 'next/navigation';


/**
 * 운영 화면의 로그아웃.
 *
 * 인증 SDK 를 **누른 순간에 받는다.** 정적으로 들이면 이 단추가 운영 레이아웃에
 * 있는 탓에 모든 운영 화면이 gzip 12KB 를 더 받는다 — 누르지 않는 사람까지.
 */
export function AdminSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        void (async () => {
          const { signOutEverywhere } = await import('@shop/auth/client');
          /*
           * **실패해도 나간다.** 끊는 쪽이 터지면(저장소가 막혔거나 창구가 넘어졌다)
           * 예전에는 여기서 멈춰 **아무 일도 안 일어났다** — 누른 사람은 나간 줄 알고
           * 자리를 떠나는데 화면은 운영 화면 그대로다. 공용 기기에서 그것이 가장 나쁘다.
           *
           * 문 자체가 이미 "서버 쪽이 실패해도 토큰은 지운다" 로 되어 있다
           * (`signOutEverywhere`). 그 뜻을 여기서도 잇는다 — 무슨 일이 있어도 이 화면을
           * 떠난다. 남은 세션이 있으면 다음 화면에서 서버가 거절한다.
           */
          try {
            await signOutEverywhere();
          } catch (error) {
            /*
             * **삼키지는 않는다.** 화면은 나가지만 끝까지 못 끊은 것은 사실이고, 그 까닭이
             * 어디에도 안 남으면 "로그아웃이 되는 것 같은데 가끔 세션이 살아 있다" 를
             * 쫓을 길이 없다. 여기서 `finally` 만 두면 그 거절이 주인 없이 떠돈다.
             */
            console.error('[auth] 로그아웃을 끝까지 못 했다', error);
          }
          router.push('/');
        })();
      }}
      className="flex min-h-10 w-full items-center rounded-[5px] px-3.5 text-[13px] text-dark-muted hover:bg-dark-surface"
    >
      로그아웃
    </button>
  );
}
