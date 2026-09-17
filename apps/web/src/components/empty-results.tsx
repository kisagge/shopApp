import Link from 'next/link';
import type { ComponentProps } from 'react';
import type { Translator } from '@shop/i18n';

type Href = ComponentProps<typeof Link>['href'];

const chip =
  'inline-flex h-10 items-center rounded-full border border-[var(--border-strong)] px-4 text-[13px] text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]';

/**
 * 결과가 없는 목록.
 *
 * **막다른 길이었다.** "검색 결과가 없습니다" 와 한 줄 안내가 전부라, 다음에 할 수 있는 일은 뒤로 가기뿐이었다.
 * 무엇을 풀면 되는지 말하고(core emptyResultReason), 그 자리에서 바로 갈 곳을 준다:
 * - 고른 조건이 있으면 **조건만 지운 주소** — 검색어·카테고리는 그대로 둔다
 * - 인기 검색어(검색 화면) — 무엇을 찾아야 할지 모르는 사람에게
 * - 카테고리 — 찾는 말 없이 둘러보는 길
 *
 * 제목 단계는 놓이는 자리가 정한다(`level`) — 검색 화면에서는 h1 바로 아래, 카테고리·브랜드 화면에서는 목록의
 * h2 아래다. 단계를 건너뛰면 제목으로 훑는 사람에게 소속이 흐려진다.
 */
export function EmptyResults({
  t,
  title,
  reason,
  clearHref,
  popular = [],
  categories,
  level = 2,
}: {
  t: Translator;
  title: string;
  reason: string;
  /** 고른 조건(가격·색상·사이즈·브랜드)만 지운 주소. 고른 것이 없으면 null */
  clearHref: Href | null;
  popular?: readonly string[];
  categories: readonly { slug: string; name: string }[];
  /** 이 상자의 제목 단계. 안의 두 갈래 제목은 한 단계 아래다 */
  level?: 2 | 3;
}) {
  const Title = level === 2 ? 'h2' : 'h3';
  const Sub = level === 2 ? 'h3' : 'h4';
  return (
    <section aria-labelledby="empty-title" className="flex flex-col items-center gap-2 py-20 text-center">
      <Title id="empty-title" className="text-[15px] font-medium">{title}</Title>
      <p className="text-[13px] text-[var(--fg-muted)]">{reason}</p>

      {clearHref && (
        <Link
          href={clearHref}
          className="mt-4 inline-flex h-11 items-center rounded-sm border border-[var(--fg)] px-5 text-[13px] font-medium text-[var(--fg)] no-underline hover:bg-[var(--surface-2)]"
        >
          {t('empty.clearFilters')}
        </Link>
      )}

      {popular.length > 0 && (
        <nav aria-labelledby="empty-popular" className="mt-10">
          <Sub id="empty-popular" className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
            {t('popular.heading')}
          </Sub>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {popular.map((word) => (
              <li key={word}>
                <Link href={{ pathname: '/search', query: { q: word } }} className={chip}>
                  {word}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {categories.length > 0 && (
        <nav aria-labelledby="empty-categories" className="mt-8">
          <Sub id="empty-categories" className="text-[11px] font-medium tracking-[0.08em] text-[var(--fg-muted)]">
            {t('empty.browseCategories')}
          </Sub>
          <ul className="mt-3 flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className={chip}>
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </section>
  );
}
