import Link from 'next/link';
import type { ComponentProps } from 'react';

/**
 * 목록 아래 "더 보기".
 *
 * 페이지 번호를 쓰지 않는 이유는 커서 방식이기 때문이다. 3쪽으로 바로 뛰는
 * 링크를 만들려면 offset 이 필요하고, offset 은 보는 사이 앞에 행이 끼어들면
 * 같은 행을 두 번 보여 준다.
 */
export function Pager({
  href,
  label,
  hasRows,
}: {
  href: ComponentProps<typeof Link>['href'] | null;
  label: string;
  hasRows: boolean;
}) {
  if (!hasRows) return null;

  return (
    <nav aria-label="페이지 이동" className="flex justify-center">
      {href ? (
        <Link
          href={href}
          className="inline-flex h-11 items-center rounded-sm border border-[var(--border-strong)] px-5 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
        >
          {label}
        </Link>
      ) : (
        <p className="text-[12px] text-[var(--fg-muted)]">마지막입니다.</p>
      )}
    </nav>
  );
}
