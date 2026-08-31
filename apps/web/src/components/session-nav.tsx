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
      <Link href="/login" className="text-xs font-medium text-[var(--fg-secondary)]">
        로그인
      </Link>
    );
  }

  const role = (data.user as { role?: string }).role;

  return (
    <span className="flex items-center gap-3">
      <Link href="/mypage" className="text-xs text-[var(--fg-secondary)] no-underline">
        마이페이지
      </Link>
      <span className="text-xs text-[var(--fg-secondary)]">
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
        className="text-xs text-[var(--fg-muted)] underline underline-offset-2"
      >
        로그아웃
      </button>
    </span>
  );
}
