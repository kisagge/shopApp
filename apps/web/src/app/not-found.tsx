import Link from 'next/link';
import { getT } from '~/lib/i18n/server';

/**
 * 없는 주소.
 *
 * 이 파일이 없으면 Next 의 기본 화면이 나온다 — **세 나라 말로 화면을 다
 * 옮겨 놓고 여기만 "This page could not be found." 가 뜬다.** 헤더와 푸터는
 * 레이아웃이 그려 주니 그 사이만 영어인, 더 이상한 상태였다.
 *
 * 색인 금지 표시는 **달지 않는다.** Next 가 없는 주소에 이미 noindex 를
 * 붙여 준다 — NO_INDEX 를 여기에 또 얹었더니 robots 메타가 두 개 나왔다.
 */

export default async function NotFound() {
  const t = await getT();

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col items-center gap-5 px-4 py-24 text-center">
      <p className="text-[11px] font-medium tracking-[0.18em] text-[var(--fg-muted)]">404</p>
      <h1 className="font-serif text-2xl font-medium tracking-tight">{t('notFound.heading')}</h1>
      <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
        {t('notFound.note')}
      </p>

      {/*
        막다른 길로 두지 않는다. 찾던 것이 아직 있을 수 있으므로 검색으로,
        아니면 홈으로 갈 길을 준다.
      */}
      <div className="mt-1 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="inline-flex h-11 items-center rounded-sm bg-[var(--brand)] px-5 text-sm font-medium text-[var(--bg)] no-underline hover:bg-n-950"
        >
          {t('notFound.home')}
        </Link>
        <Link
          href="/search"
          className="inline-flex h-11 items-center rounded-sm border border-[var(--border)] px-5 text-sm text-[var(--fg)] no-underline"
        >
          {t('notFound.search')}
        </Link>
      </div>
    </div>
  );
}
