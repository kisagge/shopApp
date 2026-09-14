'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AdminSignOut } from '~/components/admin-sign-out';
import { ThemeSwitcher } from '~/components/theme-switcher';
import { formatUnread, type Theme } from '@shop/core';

/**
 * 운영 화면의 메뉴.
 *
 * **폰에서는 메뉴가 화면을 먹고 있었다.** 사이드바가 232px 로 늘 붙어 있어서
 * 375px 짜리 화면에서는 본문에 143px 밖에 안 남았다. 한글이 한 자씩 줄바꿈돼
 * "대시보드" 가 세로로 섰고, 금액은 `1,8…원` 으로 잘렸다. 운영 콘솔이라 폰은
 * 나중 문제라고 두었는데, 정작 주문이 들어오는 것을 보는 사람은 폰을 들고 있다.
 *
 * 그래서 좁은 화면에서는 **접어 두고 불러낸다.** 넓은 화면의 사이드바는
 * 그대로다 — 표가 빽빽한 화면에서 메뉴가 늘 보이는 편이 낫다.
 *
 * 여닫는 방식은 손님 화면의 `MobileMenu` 와 같다. 거기 적어 둔 이유가 여기도
 * 그대로 적용된다 — `<details>` 는 접근성 트리에 이름도 역할도 없이 떠서
 * 버렸고, 역할과 상태를 직접 말하는 버튼으로 간다.
 */

export interface AdminNavItem {
  readonly href: string;
  readonly label: string;
  /** 안 읽은 수. 없거나 0 이면 뱃지를 안 그린다 */
  readonly badge?: number;
}

const PANEL_ID = 'admin-nav-panel';

export function AdminNav({
  items,
  roleLabel,
  merchant,
  theme,
}: {
  items: readonly AdminNavItem[];
  roleLabel: string;
  merchant: boolean;
  theme: Theme;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  /*
   * 여는 순간의 경로를 들고 있고, 지금 경로와 같을 때만 열린 것으로 본다.
   * 메뉴를 눌러 화면을 옮기면 그 자체가 곧 닫힘이다 — 이펙트에서 닫으면
   * 이동할 때마다 렌더가 한 번 더 돈다. MobileMenu 와 같은 방식이다.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpenedAt(null);
      // 닫고 포커스를 잃으면 키보드 사용자는 처음부터 다시 찾아야 한다
      buttonRef.current?.focus();
    };
    const onOutside = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpenedAt(null);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
    };
  }, [open]);

  const wordmark = (
    <p className="flex items-baseline gap-2">
      <span className="font-serif text-[19px] font-medium tracking-[0.16em] text-n-0">PLAIN</span>
      <span className="text-[10px] font-medium tracking-[0.14em] text-dark-muted">ADMIN</span>
    </p>
  );

  return (
    <div ref={rootRef}>
      {/*
        좁은 화면의 머리띠. 넓은 화면에서는 사이드바가 그 일을 하므로 감춘다.
        `sticky` 인 이유는 표가 길어도 메뉴를 다시 찾으러 맨 위까지 올라가지
        않게 하기 위해서다.
      */}
      <div className="sticky top-0 z-30 flex h-14 items-center gap-2 bg-dark-bg px-3 md:hidden">
        <button
          ref={buttonRef}
          type="button"
          aria-label="관리자 메뉴 열기"
          aria-expanded={open}
          aria-controls={PANEL_ID}
          onClick={() => setOpenedAt(pathname)}
          className="flex h-11 w-11 items-center justify-center rounded-sm text-n-0"
        >
          {/* 아이콘은 장식이다 — 이름과 상태는 버튼이 말한다 */}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="M2 5h16M2 10h16M2 15h16" />
          </svg>
        </button>
        {wordmark}
      </div>

      {/*
        **좁은 화면에서는 본문 위에 뜬다.** 자리를 차지하며 밀어내면 본문이
        다시 143px 이 된다. 넓은 화면에서는 흐름 안으로 돌아와 옆에 선다.

        `hidden` 을 쓰는 이유 — `display:none` 이라야 접힌 메뉴의 링크가
        낭독기와 탭 이동에서 빠진다. 투명도로만 숨기면 안 보이는 링크에
        포커스가 들어간다.
      */}
      <div
        id={PANEL_ID}
        className={
          'fixed inset-y-0 left-0 z-40 flex w-[264px] max-w-[82vw] flex-col gap-7 overflow-y-auto ' +
          'bg-dark-bg px-4 py-6 ' +
          'md:static md:h-auto md:w-[232px] md:max-w-none md:shrink-0 md:overflow-visible' +
          /*
           * **`hidden` 속성을 쓰지 않는다.** 처음에는 `hidden={!open}` 에
           * `md:!block` 으로 되살리려 했는데, 그 느낌표 문법은 Tailwind 3 의
           * 것이라 클래스가 아예 안 만들어졌다. 그래서 **넓은 화면에서도
           * 사이드바가 통째로 사라져 있었다** — 자리 검사는 그것을 못 본다.
           * 없는 메뉴는 자리를 무너뜨리지 않기 때문이다.
           *
           * 접는 것을 좁은 화면에만 거는 편이 낫다. 느낌표도 필요 없고,
           * 넓은 화면에서 숨길 방법 자체가 없어진다.
           */
          (open ? '' : ' max-md:hidden')
        }
      >
        {/*
          **서랍이 자기 닫기 단추를 갖는다.** 처음에는 머리띠의 단추가 X 로
          바뀌게 두었는데, 운영 화면은 손님 헤더 아래에 들어가 있어서 서랍이
          띠까지 덮었다 — 첫 항목(대시보드)이 띠 뒤에 숨었고, 닫는 길은 Esc 와
          바깥 누르기뿐이었다. 덮는 것을 막느니 덮고 나서 스스로 닫는다.
        */}
        <div className="flex items-center gap-2 md:px-1.5">
          <button
            type="button"
            aria-label="관리자 메뉴 닫기"
            onClick={() => {
              setOpenedAt(null);
              buttonRef.current?.focus();
            }}
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-n-0 md:hidden"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M4 4l12 12M16 4L4 16" />
            </svg>
          </button>
          {wordmark}
        </div>

        <nav aria-label="관리자 메뉴" className="flex-1 md:mt-0">
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  // 목록은 서버가 권한을 보고 만든다 — 타입은 그쪽이 지킨다
                  href={item.href as never}
                  className="flex min-h-11 items-center justify-between gap-2 rounded-[5px] px-3.5 text-sm text-dark-muted no-underline hover:bg-dark-surface hover:text-n-0"
                >
                  {item.label}
                  {item.badge ? (
                    /*
                     * **숫자만 두지 않는다.** 낭독기는 "알림 3" 이라고만 읽어 무엇이
                     * 3 인지 말하지 않는다. 눈에 보이는 숫자는 가리고 뜻을 적는다.
                     */
                    <span className="tnum rounded-full bg-accent px-1.5 py-0.5 text-[11px] font-medium leading-none text-n-0">
                      <span aria-hidden="true">{formatUnread(item.badge)}</span>
                      <span className="sr-only">안 읽은 알림 {item.badge}건</span>
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t border-dark-surface2 pt-3">
          {/*
            **눈에 있는 쪽에 둔다.** 같은 것이 매장 푸터에도 있고 그 푸터는
            운영 화면 맨 아래에도 붙는다 — 다만 주문 표가 몇 백 줄인 화면에서
            그것은 스크롤 끝의 다른 세상이다. 사이드바는 늘 보인다.

            이 사이드바는 테마와 무관하게 늘 어둡다. 그래서 "밝게" 를 눌러도
            여기는 안 바뀌는데, 말해 주지 않으면 눌러도 안 먹는 것으로 읽힌다.
          */}
          <div className="px-3.5 pb-3">
            <p className="pb-1 text-[11px] text-dark-muted">화면 밝기 — 본문에 적용됩니다</p>
            <ThemeSwitcher current={theme} tone="sidebar" />
          </div>

          <p className="border-t border-dark-surface2 px-3.5 pt-3 pb-2">
            <span className="block text-[13px] font-medium text-n-0">{roleLabel}</span>
            {merchant && <span className="block text-[11px] text-dark-muted">가맹점 계정</span>}
          </p>
          <AdminSignOut />
        </div>
      </div>

      {/*
        열린 메뉴 뒤의 화면을 덮는다. 눌러서 닫는 길은 바깥 눌림이 이미
        맡고 있으므로, 이것은 **어디까지가 메뉴인지 보여 주는 역할**이다.
      */}
      {open && (
        <div aria-hidden="true" className="fixed inset-0 z-20 bg-n-950/40 md:hidden" />
      )}
    </div>
  );
}
