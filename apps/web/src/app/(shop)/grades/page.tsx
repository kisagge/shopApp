import Link from 'next/link';
import type { Metadata } from 'next';
import {
  MEMBER_GRADE, GRADE_THRESHOLD, GRADE_REWARD_PERCENT, ZERO,
} from '@shop/core';
import { formatMoney, formatPercent } from '@shop/i18n';
import { GRADE_KEY } from '~/lib/i18n/enum-labels';
import { getLocale, getT } from '~/lib/i18n/server';
import { getViewer } from '~/lib/viewer';
import { getEffectiveGrade } from '~/lib/grade/effective';

/** 세션을 읽어 지금 등급을 표시한다 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())('grade.guide') };
}

/**
 * 회원 등급 안내.
 *
 * **정책은 core 에 있는데 보여 주는 화면이 없었다.** `GRADE_THRESHOLD` 는 `grade.ts` 안에서만 쓰이고 있었다 —
 * 손님이 보는 것은 마이페이지의 "내 등급" 과 "다음 등급까지 얼마" 뿐이어서, **VIP 가 되려면 얼마를 써야 하고
 * 그러면 적립률이 몇 %가 되는지** 알 길이 없었다. 로그인하지 않은 사람은 등급 제도가 있다는 것도 모른다.
 *
 * 등급에는 적립률이 붙어 있으니 이 표는 곧 돈에 대한 약속이다. 약관을 푸터에 두는 것과 같은 이유로, 사다리
 * 전체를 한 화면에서 볼 수 있어야 한다.
 *
 * **목록을 손으로 적지 않는다.** 등급이 하나 늘면 이 화면에도 저절로 들어온다 — 그 전수는 검사가 지킨다.
 *
 * **표로 그린다.** 등급·조건·적립률 셋을 나란히 견주는 자리라 줄과 열이 있고, 줄 머리가 등급 이름이다.
 * 목록으로 늘어놓으면 낭독기로 듣는 사람은 어느 값이 어느 등급의 것인지 되짚어야 한다.
 */
export default async function GradesPage() {
  const [t, locale, viewer] = await Promise.all([getT(), getLocale(), getViewer()]);
  /*
   * 로그인했으면 지금 등급에 표시를 남긴다. **저장된 등급이 아니라 실제로 적용되는 등급**이다 —
   * 운영진이 올려 준 등급과 구매액이 말하는 등급 중 높은 쪽(effectiveGrade).
   */
  const mine = viewer ? await getEffectiveGrade(viewer.id) : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 pb-24 md:px-10">
      <header className="flex flex-col gap-2 py-8">
        <p className="text-[11px] font-medium tracking-[0.16em] text-[var(--fg-muted)]">MEMBERSHIP</p>
        <h1 className="text-xl font-semibold tracking-tight md:text-[28px]">{t('grade.guide')}</h1>
        <p className="mt-1 max-w-[560px] text-[13px] leading-relaxed text-[var(--fg-secondary)]">
          {t('grade.guideNote')}
        </p>
      </header>

      {/*
        **칸마다 좌우 여백을 준다.** 안 주면 숫자가 길어지는 순간 두 값이 한 덩어리로 읽힌다
        ("3,000,000원 이상5%") — 정산 금액에서 실제로 그랬고, `table-spacing` 그물이 지킨다.
        양 끝은 흘려 두어 표가 본문 선에 맞는다.
      */}
      <table className="w-full max-w-[640px] border-collapse text-[13px]">
        <thead>
          <tr className="border-b border-[var(--border)]">
            <th scope="col" className="px-3 py-2.5 text-left font-medium first:pl-0 last:pr-0">
              {t('grade.guide')}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium last:pr-0">
              {t('grade.condition')}
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium last:pr-0">
              {t('grade.reward')}
            </th>
          </tr>
        </thead>
        <tbody>
          {MEMBER_GRADE.map((grade) => {
            const threshold = GRADE_THRESHOLD[grade];
            const current = mine?.grade === grade;

            return (
              <tr key={grade} className="border-b border-[var(--border)] last:border-0">
                <th scope="row" className="px-3 py-3.5 text-left font-medium first:pl-0">
                  {t(GRADE_KEY[grade])}
                  {/*
                    **색으로만 알리지 않는다.** 지금 등급을 굵게·진하게만 두면 낭독기로 듣는 사람에게는
                    네 줄이 똑같이 들린다. 글자로 적는다.
                  */}
                  {current && (
                    <span className="ml-2 text-[11px] font-normal text-accent">
                      {t('grade.current')}
                    </span>
                  )}
                </th>
                <td className="tnum px-3 py-3.5 text-right text-[var(--fg-secondary)]">
                  {/* 가입 등급은 "0원 이상" 이 아니다 — 조건이 없다는 말을 조건처럼 쓰지 않는다 */}
                  {threshold === ZERO
                    ? t('grade.start')
                    : t('grade.from', { amount: formatMoney(locale, threshold) })}
                </td>
                <td className="tnum px-3 py-3.5 text-right last:pr-0">
                  {formatPercent(locale, GRADE_REWARD_PERCENT[grade])}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <p className="mt-5 max-w-[560px] text-[12px] leading-relaxed text-[var(--fg-muted)]">
        {t('grade.manualNote')}
      </p>

      {/* 내 누계가 얼마인지와 다음 등급까지 남은 금액은 마이페이지가 띠로 보여 준다 */}
      <p className="mt-6 text-[13px]">
        <Link href={mine ? '/mypage' : '/login'}>
          {mine ? t('my.heading') : t('nav.login')}
        </Link>
      </p>
    </div>
  );
}
