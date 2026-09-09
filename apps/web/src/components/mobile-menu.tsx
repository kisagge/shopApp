'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SessionNav } from './session-nav';
import { SearchBox } from './search-box';
import { useT } from '~/lib/i18n/client';

type Category = { slug: string; name: string };

const PANEL_ID = 'mobile-menu-panel';

/**
 * 좁은 화면의 헤더 메뉴.
 *
 * 데스크톱 헤더의 카테고리 내비게이션은 md 아래에서 숨고 검색은 sm 아래에서
 * 숨는다. 그 자리를 메우는 것이 이 메뉴다.
 *
 * 처음에는 <details>/<summary> 로 만들었다. 자바스크립트 없이도 열리는 것이
 * 좋아서였는데, 접근성 트리를 실제로 읽어 보니 **summary 가 이름도 역할도
 * 없이 노출되지 않았다.** 화면 낭독기에게는 없는 것이나 마찬가지다. 검증할
 * 수 없는 접근성은 접근성이 아니라서 버렸다.
 *
 * 대신 역할과 상태를 직접 말하는 버튼으로 간다. 자바스크립트가 없을 때의
 * 길은 푸터가 맡는다 — 카테고리 목록이 모든 페이지 아래에 있다.
 */
export function MobileMenu({ categories }: { categories: Category[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const t = useT();

  /**
   * 여는 순간의 경로를 들고 있고, 지금 경로와 같을 때만 열린 것으로 본다.
   *
   * 페이지를 옮기면 열어 둔 메뉴가 새 화면을 덮으므로 닫아야 하는데,
   * 이펙트에서 setState 로 닫으면 이동할 때마다 렌더가 한 번 더 돈다.
   * 경로에서 파생시키면 이동 자체가 곧 닫힘이다.
   */
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const setOpen = (next: boolean) => setOpenedAt(next ? pathname : null);

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // setOpen 은 렌더마다 새로 만들어지므로 이펙트 안에서는 쓰지 않는다
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

  return (
    <div ref={rootRef} className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label={t('nav.menu')}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        onClick={() => setOpen(!open)}
        className="-ml-2.5 flex h-11 w-11 items-center justify-center text-[var(--fg)]"
      >
        {/* 아이콘은 장식이다 — 이름과 상태는 버튼이 말한다 */}
        <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {open ? <path d="M4 4l12 12M16 4L4 16" /> : <path d="M2 5h16M2 10h16M2 15h16" />}
        </svg>
      </button>

      <div
        id={PANEL_ID}
        hidden={!open}
        className="absolute inset-x-0 top-full max-h-[70dvh] overflow-y-auto border-b border-[var(--border)] bg-[var(--bg)] px-4 pt-4 pb-5"
      >
        {/* GET 폼이라 자바스크립트 없이도 검색이 된다 */}
        <form method="get" action="/search" role="search" className="flex gap-2">
          <SearchBox id="menu-search" variant="menu" />
        </form>

        <nav aria-label={t('nav.categoriesPlain')} className="mt-4 border-t border-[var(--border)]">
          <ul>
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="flex h-12 items-center text-sm text-[var(--fg)] no-underline"
                >
                  {t.category(c.slug, c.name)}
                </Link>
              </li>
            ))}
            {/* 기획전은 갈래가 아니라 편집이라 카테고리 뒤에 따로 둔다 */}
            <li>
              <Link
                href="/collections"
                className="flex h-12 items-center text-sm font-medium text-[var(--fg)] no-underline"
              >
                {t('collection.heading')}
              </Link>
            </li>
          </ul>
        </nav>

        <div className="border-t border-[var(--border)] pt-3">
          <SessionNav variant="menu" />
        </div>
      </div>
    </div>
  );
}
