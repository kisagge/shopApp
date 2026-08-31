'use client';

import { useRouter } from 'next/navigation';
import { authClient } from '@shop/auth/client';

export function AdminSignOut() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => {
        void authClient.signOut().then(() => router.push('/'));
      }}
      className="flex min-h-10 w-full items-center rounded-[5px] px-3.5 text-[13px] text-dark-muted hover:bg-dark-surface"
    >
      로그아웃
    </button>
  );
}
