import Link from 'next/link';
import { daysUntilEffective, POLICY_PATH, type PolicyKind } from '@shop/core';
import { formatDate } from '@shop/i18n';
import { RichText } from '~/components/rich-text';
import { getLocale, getT } from '~/lib/i18n/server';
import type { PolicyDoc, PolicyRevisionDoc } from '~/lib/policies/policy';

/**
 * 약관·개인정보처리방침 본문.
 *
 * **지금 무엇이 효력을 갖는지가 첫 줄에 있다.** 문서만 덩그러니 놓으면 읽는 사람은 이것이 언제부터의 약속인지 알 수 없고,
 * 바뀐 뒤에 들어온 사람은 자기가 동의한 것이 이 글인지 알 수 없다. 그래서 시행일을 제목 바로 아래 적고, 지난 방침으로
 * 가는 길을 본문 끝에 둔다.
 *
 * 문서를 아직 한 번도 쓰지 않았으면 빈 화면 대신 그 사실을 말한다 — 결제 화면이 "동의합니다" 를 받는 자리라 링크가
 * 막다른 길이 되면 안 된다.
 */
export async function PolicyView({
  kind,
  doc,
  revisions,
  viewing,
}: {
  kind: PolicyKind;
  doc: PolicyDoc | null;
  revisions: readonly PolicyRevisionDoc[];
  /** 지난 방침을 보고 있으면 그 판. 현재 방침이면 null */
  viewing: PolicyRevisionDoc | null;
}) {
  const [t, locale] = await Promise.all([getT(), getLocale()]);
  const shown = viewing ?? doc;
  const date = (value: Date) => formatDate(locale, value);

  if (!shown) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 py-16 md:px-10">
        <h1 className="font-serif text-2xl tracking-tight">{t(`policy.${kind}` as const)}</h1>
        <p className="mt-6 text-[13px] leading-relaxed text-[var(--fg-muted)]">{t('policy.empty')}</p>
      </div>
    );
  }

  const upcoming = viewing === null && doc !== null ? daysUntilEffective(doc) : null;

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 py-12 md:px-10">
      <h1 className="font-serif text-2xl tracking-tight">{shown.title}</h1>

      <p className="mt-2 text-[12px] text-[var(--fg-muted)]">
        <time dateTime={shown.effectiveAt.toISOString()}>
          {t('policy.effectiveOn', { date: date(shown.effectiveAt) })}
        </time>
      </p>

      {/*
        **시행 전 문서는 그렇게 적는다.** 개인정보처리방침은 바꾸기 전에 미리 알려야 해서 예고로 먼저 올라온다. 그때
        지금 효력을 갖는 것은 지난 방침이고, 그 사실을 말하지 않으면 읽는 사람은 이미 바뀐 줄 안다.
      */}
      {upcoming !== null && (
        <p className="mt-4 rounded-sm bg-[var(--accent-soft)] px-4 py-3 text-[13px] leading-relaxed text-accent">
          {t('policy.upcoming', { days: upcoming })}
        </p>
      )}

      {viewing !== null && (
        <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-[var(--surface-1)] px-4 py-3 text-[13px] leading-relaxed">
          <span>{t('policy.pastNotice', { date: date(viewing.replacedAt) })}</span>
          <Link href={POLICY_PATH[kind]} className="underline underline-offset-2">
            {t('policy.seeCurrent')}
          </Link>
        </p>
      )}

      <article className="mt-8">
        {shown.bodyRich ? (
          <RichText doc={shown.bodyRich} />
        ) : (
          // 서식 없이 쓰인 옛 문서. 줄바꿈만 살려 그린다 — 공지가 쓰는 방식과 같다
          <p className="whitespace-pre-wrap text-[15px] leading-loose text-[var(--fg-secondary)]">{shown.body}</p>
        )}
      </article>

      {revisions.length > 0 && (
        <section aria-labelledby="past-policies" className="mt-12 border-t border-[var(--border)] pt-6">
          <h2 id="past-policies" className="text-[13px] font-semibold">{t('policy.past')}</h2>
          <p className="mt-1.5 text-[12px] leading-relaxed text-[var(--fg-muted)]">{t('policy.pastNote')}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {revisions.map((r) => (
              <li key={r.id}>
                <Link
                  href={`${POLICY_PATH[kind]}?v=${r.id}`}
                  aria-current={viewing?.id === r.id ? 'page' : undefined}
                  className="text-[13px] text-[var(--fg-secondary)] underline underline-offset-2"
                >
                  {t('policy.effectiveOn', { date: date(r.effectiveAt) })}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
