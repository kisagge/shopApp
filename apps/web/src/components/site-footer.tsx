import Link from 'next/link';
import { getTopCategories } from '~/lib/queries/catalog/products';
import { getT } from '~/lib/i18n/server';
import { LocaleSwitcher } from './locale-switcher';

export async function SiteFooter() {
  const [categories, t] = await Promise.all([getTopCategories(), getT()]);

  return (
    <footer className="safe-b mt-20 border-t border-[var(--border)] bg-[var(--surface)]">
      <div className="mx-auto w-full max-w-[1280px] px-4 py-10 md:px-10">
        {/*
          헤더의 카테고리 내비게이션은 좁은 화면에서 메뉴 버튼 뒤로 들어간다.
          그 버튼은 자바스크립트가 있어야 열린다. 여기 목록은 서버가 그린
          평범한 링크라서, 스크립트가 없거나 실패해도 카테고리로 갈 수 있다.
        */}
        <nav aria-label={t('nav.categoriesFooter')}>
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="inline-flex h-9 items-center text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
                >
                  {t.category(c.slug, c.name)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/*
          입점 신청 입구. 헤더에 두기에는 고객이 쓸 일이 아니고, 아예 없으면
          브랜드가 찾아올 방법이 없다 — 쇼핑몰 푸터의 흔한 자리다.
        */}
        <p className="mt-6 flex flex-wrap gap-x-6">
          <Link
            href="/support"
            className="inline-flex h-9 items-center text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
          >
            {t('support.heading')}
          </Link>
          <Link
            href="/merchant/apply"
            className="inline-flex h-9 items-center text-sm text-[var(--fg-secondary)] no-underline hover:text-[var(--fg)]"
          >
            {t('nav.merchantApply')}
          </Link>
        </p>

        <p className="mt-4 font-serif text-lg font-medium tracking-[0.18em]">PLAIN</p>
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--fg-muted)]">
          {t('footer.disclaimer')}
        </p>

        {/*
          언어 선택을 푸터에 둔다. 헤더는 좁은 화면에서 이미 꽉 찼고, 언어는
          한 번 고르면 다시 건드릴 일이 드문 설정이다 — 매 화면 위쪽 자리를
          차지할 만한 것이 아니다.
        */}
        <div className="mt-6 border-t border-[var(--border)] pt-4">
          <LocaleSwitcher />
        </div>
      </div>
    </footer>
  );
}
