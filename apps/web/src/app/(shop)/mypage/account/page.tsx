import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { prisma } from '@shop/db';
import { getViewer } from '~/lib/viewer';
import { TrackedLink as Link } from '~/components/tracked-link';
import { ProfileForm, PasswordForm } from '~/components/account-forms';
import { getT } from '~/lib/i18n/server';
import { NO_INDEX } from '~/lib/no-index';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('acct.heading'), ...NO_INDEX };
}
export const dynamic = 'force-dynamic';

/**
 * 회원정보 수정 · 비밀번호 변경.
 *
 * 이름·연락처는 **DB 에서 읽는다**(세션 캐시가 아니라) — 방금 저장한 값이 5분 캐시 때문에 옛 값으로 다시 채워지면
 * 저장이 안 된 줄 안다.
 *
 * 비밀번호 칸은 **비밀번호로 가입한 계정에만** 둔다. 구글로 가입한 계정에는 비밀번호가 없어서, 칸을 두면 무엇을
 * "지금 비밀번호" 에 적어야 할지 모른다.
 */
export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect('/login?next=/mypage/account');

  const [user, t] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewer.id },
      select: {
        name: true, email: true, phone: true,
        accounts: { where: { providerId: 'credential' }, select: { id: true }, take: 1 },
      },
    }),
    getT(),
  ]);
  if (!user) redirect('/login?next=/mypage/account');
  const hasPassword = user.accounts.length > 0;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 pb-24 md:px-10">
      <nav aria-label={t('nav.breadcrumb')} className="pt-6 pb-2">
        <Link href="/mypage" className="text-xs text-[var(--fg-muted)]">
          ← {t('nav.mypage')}
        </Link>
      </nav>
      <h1 className="pb-6 text-xl font-semibold tracking-tight md:text-2xl">{t('acct.heading')}</h1>

      <section aria-labelledby="profile-title" className="flex flex-col gap-4 border-t border-[var(--border)] pt-6">
        <h2 id="profile-title" className="text-[15px] font-semibold">{t('acct.profile')}</h2>
        <dl className="flex flex-col gap-1">
          <dt className="text-xs font-medium text-[var(--fg-secondary)]">{t('acct.email')}</dt>
          <dd className="text-sm">
            {user.email}
            <span className="mt-0.5 block text-[12px] text-[var(--fg-muted)]">{t('acct.emailNote')}</span>
          </dd>
        </dl>
        <ProfileForm name={user.name} phone={user.phone} />
      </section>

      <section aria-labelledby="password-title" className="mt-10 flex flex-col gap-4 border-t border-[var(--border)] pt-6">
        <h2 id="password-title" className="text-[15px] font-semibold">{t('acct.password')}</h2>
        {hasPassword ? (
          <PasswordForm email={user.email} />
        ) : (
          <p className="text-[13px] text-[var(--fg-secondary)]">{t('acct.noPassword')}</p>
        )}
      </section>
    </div>
  );
}
