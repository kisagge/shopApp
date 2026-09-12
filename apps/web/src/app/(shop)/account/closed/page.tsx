import Link from 'next/link';
import type { Metadata } from 'next';
import { NO_INDEX } from '~/lib/no-index';
import { getT } from '~/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('closed.title'), ...NO_INDEX, };
}

/**
 * 탈퇴가 끝났다는 것만 말하는 화면.
 *
 * 홈으로 그냥 돌려보내면 로그아웃된 첫 화면과 구분이 안 돼서 **정말
 * 처리된 것인지 알 수 없다.** 되돌릴 수 없는 동작일수록 끝났다는 말이
 * 있어야 한다.
 *
 * 로그인이 필요 없다 — 이 화면에 오는 사람은 방금 계정이 사라졌다.
 */
export default async function AccountClosedPage() {
  const t = await getT();

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col items-center gap-5 px-4 py-24 text-center">
      <h1 className="text-xl font-semibold tracking-tight">{t('closed.heading')}</h1>

      <p className="text-[14px] leading-relaxed text-[var(--fg-secondary)]">
        {t('closed.what')}
      </p>

      <p className="text-[13px] text-[var(--fg-muted)]">
        {t('closed.thanks')}
      </p>

      <Link
        href="/"
        className="mt-2 inline-flex h-12 items-center rounded-sm bg-[var(--brand)] px-6 text-[14px] font-medium text-[var(--bg)] no-underline"
      >
        {t('closed.home')}
      </Link>
    </div>
  );
}
