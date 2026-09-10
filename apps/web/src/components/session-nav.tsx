'use client';

import { useEffect, useState } from 'react';
import { TrackedLink as Link } from './tracked-link';
import { useRouter } from 'next/navigation';
import { isNativeShell } from '@shop/native';
import type { Translator } from '@shop/i18n';
import { useT } from '~/lib/i18n/client';

/**
 * 헤더의 로그인 상태 영역.
 *
 * **세션은 서버가 넘겨 준다.** 예전에는 이 조각이 `authClient.useSession()` 으로
 * 직접 물었고, 그 이유가 "서버에서 읽으면 헤더를 쓰는 모든 페이지가 동적
 * 렌더링으로 묶인다" 였다. 그 사이 화면이 늘어 **124개 라우트가 전부 이미
 * 동적**이 되었다 — 이유는 사라지고 값만 남았다. better-auth 클라이언트가
 * 모든 화면에 gzip 12KB 씩 따라오고 있었다.
 *
 * 서버가 주면 **깜빡임도 사라진다.** 예전에는 첫 그림에서 자리만 잡아 두고
 * 세션이 오면 다시 그렸다.
 *
 * ── 네이티브 셸만의 예외 ────────────────────────────────────────
 * 웹뷰는 앱을 다시 띄울 때 쿠키를 잃는 경우가 있고, 그때 서버는 세션을 보지
 * 못한다. 앱은 그 대비로 토큰을 따로 들고 있다(Bearer). 그 경로를 위해
 * **앱에서만** 클라이언트 세션을 한 번 더 물어 본다 — `import()` 로 부르므로
 * 브라우저는 이 코드를 받지 않는다.
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

export interface NavUser {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export function SessionNav({
  user,
  variant = 'header',
}: {
  user: NavUser | null;
  variant?: Variant;
}) {
  const router = useRouter();
  const t = useT();

  const menu = variant === 'menu';
  const native = useNativeSession(user);
  const data = user ?? native;

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

  const role = data.role;
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
          {data.name}
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
          onClick={() => void signOut(router)}
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
        {data.name}
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
        onClick={() => void signOut(router)}
        className="shrink-0 text-xs text-[var(--fg-muted)] underline underline-offset-2"
      >
        {t('nav.logout')}
      </button>
    </span>
  );
}

/** 로그아웃은 사람이 누른 순간이다. 그때 받아도 늦지 않다. */
async function signOut(router: ReturnType<typeof useRouter>): Promise<void> {
  const { signOutEverywhere } = await import('@shop/auth/client');
  await signOutEverywhere();
  router.refresh();
}

/**
 * 앱에서 쿠키가 날아갔을 때만 도는 보정.
 *
 * 서버가 이미 알아봤으면 아무것도 하지 않는다. 브라우저에서는
 * `isNativeShell()` 이 false 라 `import()` 자체가 일어나지 않는다.
 */
function useNativeSession(known: NavUser | null): NavUser | null {
  const [user, setUser] = useState<NavUser | null>(null);

  useEffect(() => {
    if (known !== null || !isNativeShell()) return;

    let alive = true;
    void (async () => {
      const { authClient } = await import('@shop/auth/client');
      const { data } = await authClient.getSession();
      const session = data?.user as { id?: string; name?: string; role?: string } | undefined;
      if (alive && session?.id) {
        setUser({ id: session.id, name: session.name ?? '', role: session.role ?? 'CUSTOMER' });
      }
    })();

    return () => {
      alive = false;
    };
  }, [known]);

  return user;
}
