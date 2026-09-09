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
          await signOutEverywhere();
          router.push('/');
        })();
      }}
      className="flex min-h-10 w-full items-center rounded-[5px] px-3.5 text-[13px] text-dark-muted hover:bg-dark-surface"
    >
      로그아웃
    </button>
  );
}
