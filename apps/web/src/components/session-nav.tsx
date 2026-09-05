'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authClient, signOutEverywhere } from '@shop/auth/client';
import type { Translator } from '@shop/i18n';
import { useT } from '~/lib/i18n/client';

/**
 * 헤더의 로그인 상태 영역.
 *
 * 서버에서 세션을 읽어 넘길 수도 있지만, 그러면 헤더를 쓰는 모든 페이지가
 * 동적 렌더링으로 묶인다. 이 조각만 클라이언트에서 세션을 읽는다.
 */
/**
 * 'header' 는 헤더 한 줄에 들어가는 가로 배치,
 * 'menu' 는 모바일 메뉴 안에 세로로 쌓이는 배치다.
 */
type Variant = 'header' | 'menu';

function roleLabel(t: Translator, role: string): string {
  if (role === 'SUPER_ADMIN') return t('role.superAdmin');
  if (role === 'ADMIN') return t('role.admin');
  return t('role.merchant');
}

export function SessionNav({ variant = 'header' }: { variant?: Variant } = {}) {
  const { data, isPending } = authClient.useSession();
  const router = useRouter();
  const t = useT();

  const menu = variant === 'menu';

  if (isPending) {
    // 레이아웃이 흔들리지 않게 자리만 잡아 둔다
    return <span aria-hidden="true" className={menu ? 'block h-12' : 'inline-block h-5 w-24'} />;
  }

  if (!data) {
    return (
      <Link
        href="/login"
        className={
          menu
            ? 'flex h-12 items-center text-sm font-medium text-[var(--fg)] no-underline'
            : 'shrink-0 whitespace-nowrap text-xs font-medium text-[var(--fg-secondary)]'
        }
      >
        {t('nav.login')}
      </Link>
    );
  }

  const role = (data.user as { role?: string }).role;
  /*
   * 운영진·가맹점은 **콘솔로 가는 길이 화면에 있어야 한다.** 주소를 외워
   * 쳐야만 들어갈 수 있으면 없는 것과 같다. 권한 검사는 /admin 이 다시
   * 하므로 여기서는 길만 낸다.
   */
  const staff = role !== undefined && role !== 'CUSTOMER';
  const consoleLabel = staff ? t('nav.console', { role: roleLabel(t, role) }) : '';

  if (menu) {
    return (
      <>
        <p className="flex h-9 items-center gap-1.5 text-sm text-[var(--fg-secondary)]">
          {data.user.name}
          {role && role !== 'CUSTOMER' && (
            <span className="rounded-xs bg-n-900 px-1.5 py-0.5 text-[10px] font-semibold text-n-0">
              {roleLabel(t, role)}
            </span>
          )}
        </p>
        <Link href="/mypage" className="flex h-12 items-center text-sm text-[var(--fg)] no-underline">
          {t('nav.mypage')}
        </Link>
        {staff && (
          <Link
            href="/admin"
            className="flex h-12 items-center text-sm font-medium text-[var(--fg)] no-underline"
          >
            {consoleLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            void signOutEverywhere().then(() => router.refresh());
          }}
          className="flex h-12 w-full items-center text-left text-sm text-[var(--fg-muted)]"
        >
          {t('nav.logout')}
        </button>
      </>
    );
  }

  return (
    // 모바일에서 좁아지면 "마이페 / 이지" 처럼 단어 중간에서 끊긴다.
    // 줄바꿈을 막고, 자리가 모자라면 이름부터 감춘다 — 동작(마이페이지·로그아웃)이
    // 이름보다 중요하다.
    <span className="flex items-center gap-3 whitespace-nowrap">
      <Link href="/mypage" className="shrink-0 text-xs text-[var(--fg-secondary)] no-underline">
        {t('nav.mypage')}
      </Link>
      <span className="hidden text-xs text-[var(--fg-secondary)] sm:inline">
        {data.user.name}
      </span>
      {/* 이름은 자리가 모자라면 감추지만 이 문은 남긴다 */}
      {staff && (
        <Link
          href="/admin"
          aria-label={consoleLabel}
          className="shrink-0 rounded-xs bg-n-900 px-1.5 py-0.5 text-[10px] font-semibold text-n-0 no-underline hover:bg-n-700"
        >
          {roleLabel(t, role)}
        </Link>
      )}
      <button
        type="button"
        onClick={() => {
          void signOutEverywhere().then(() => router.refresh());
        }}
        className="shrink-0 text-xs text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('nav.logout')}
      </button>
    </span>
  );
}
