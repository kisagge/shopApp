'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient } from '@shop/auth/client';

/**
 * 헤더의 로그인 상태 영역.
 *
 * 서버에서 세션을 읽어 넘길 수도 있지만, 그러면 헤더를 쓰는 모든 페이지가
 * 동적 렌더링으로 묶인다. 이 조각만 클라이언트에서 세션을 읽는다.
 */
export function SessionNav() {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();

  if (isPending) {
    // 레이아웃이 흔들리지 않게 자리만 잡아 둔다
    return <span aria-hidden="true" className="inline-block h-5 w-24" />;
  }

  if (!data) {
    return (
      <Link href="/login" className="shrink-0 whitespace-nowrap text-xs font-medium text-[var(--fg-secondary)]">
        로그인
      </Link>
    );
  }

  const role = (data.user as { role?: string }).role;

  return (
    // 모바일에서 좁아지면 "마이페 / 이지" 처럼 단어 중간에서 끊긴다.
    // 줄바꿈을 막고, 자리가 모자라면 이름부터 감춘다 — 동작(마이페이지·로그아웃)이
    // 이름보다 중요하다.
    <span className="flex items-center gap-3 whitespace-nowrap">
      <Link href="/mypage" className="shrink-0 text-xs text-[var(--fg-secondary)] no-underline">
        마이페이지
      </Link>
      <span className="hidden text-xs text-[var(--fg-secondary)] sm:inline">
        {data.user.name}
        {role && role !== 'CUSTOMER' && (
          <span className="ml-1.5 rounded-xs bg-n-900 px-1.5 py-0.5 text-[10px] font-semibold text-n-0">
            {role === 'SUPER_ADMIN' ? '슈퍼관리자' : role === 'ADMIN' ? '관리자' : '가맹점'}
          </span>
        )}
      </span>
      <button
        type="button"
        onClick={() => {
          void authClient.signOut().then(() => router.refresh());
        }}
        className="shrink-0 text-xs text-[var(--fg-muted)] underline underline-offset-2"
      >
        로그아웃
      </button>
    </span>
  );
}
