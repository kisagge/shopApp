import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { CLOSURE_EFFECT, CLOSURE_BLOCK_MESSAGE } from '@shop/core';
import { getSessionUser } from '@shop/auth/session';
import { inspectClosure } from '~/lib/account/close-account';
import { CloseAccountForm } from '~/components/close-account-form';

export const metadata: Metadata = { title: '회원 탈퇴' };
export const dynamic = 'force-dynamic';

export default async function CloseAccountPage() {
  const session = await getSessionUser(await headers());
  if (!session) redirect('/login?next=/mypage/close');

  /*
   * 막히는지를 **화면에서 먼저 본다.**
   *
   * 다 적고 확인 문구까지 친 뒤에 "배송 중인 주문이 있습니다" 를 받으면
   * 그 시간이 통째로 헛것이 된다. API 도 같은 함수로 다시 본다 — 여기서만
   * 막으면 주소를 직접 부르는 요청이 그대로 통과한다.
   */
  const check = await inspectClosure(session.id);

  const erased = CLOSURE_EFFECT.filter((e) => e.how === 'erase');
  const kept = CLOSURE_EFFECT.filter((e) => e.how === 'keep');

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 md:px-10">
      <nav aria-label="위치" className="pt-8 text-xs text-[var(--fg-muted)]">
        <Link href="/mypage" className="no-underline hover:underline">
          마이페이지
        </Link>
        <span aria-hidden="true"> › </span>
        <span>회원 탈퇴</span>
      </nav>

      <h1 className="pt-3 pb-5 text-xl font-semibold tracking-tight md:text-2xl">회원 탈퇴</h1>

      {!check.allowed && (
        <section
          aria-labelledby="blocked-title"
          className="mb-7 rounded-sm border border-accent/40 bg-accent/8 p-5"
        >
          <h2 id="blocked-title" className="text-[14px] font-semibold text-accent">
            지금은 탈퇴할 수 없습니다
          </h2>
          <ul className="mt-3 flex list-none flex-col gap-2 p-0">
            {check.blocks.map((block) => (
              <li key={block} className="text-[13px] leading-relaxed">
                {CLOSURE_BLOCK_MESSAGE[block]}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="effect-title" className="flex flex-col gap-5">
        <h2 id="effect-title" className="text-[15px] font-semibold">
          탈퇴하면 이렇게 됩니다
        </h2>

        <div className="rounded-sm border border-[var(--border)] p-5">
          <h3 className="text-[13px] font-semibold">지워지는 것</h3>
          <ul className="mt-2.5 flex list-none flex-col gap-1.5 p-0">
            {erased.map((effect) => (
              <li key={effect.what} className="text-[13px] leading-relaxed">
                {effect.what}
                {effect.why && (
                  <span className="block text-[12px] text-[var(--fg-muted)]">{effect.why}</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-sm border border-[var(--border)] p-5">
          <h3 className="text-[13px] font-semibold">남는 것</h3>
          <ul className="mt-2.5 flex list-none flex-col gap-2 p-0">
            {kept.map((effect) => (
              <li key={effect.what} className="text-[13px] leading-relaxed">
                {effect.what}
                <span className="block text-[12px] text-[var(--fg-muted)]">{effect.why}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          같은 이메일로 <b>다시 가입할 수 있습니다.</b> 다만 지난 주문 내역이나 포인트는
          돌아오지 않고, 새로 가입한 계정으로 시작합니다.
        </p>
      </section>

      {check.allowed && <CloseAccountForm />}
    </div>
  );
}
