'use client';

import Link from 'next/link';
import { useId } from 'react';
import { CONSENT, CONSENT_REQUIRED, POLICY_PATH, type ConsentName } from '@shop/core';
import { useT } from '~/lib/i18n/client';

export type ConsentState = Record<ConsentName, boolean>;

export const EMPTY_CONSENT: ConsentState = { terms: false, privacy: false, marketing: false };

/** 문서로 가는 길이 있는 동의. 마케팅 수신은 읽을 문서가 따로 없다 */
const DOCUMENT = {
  terms: POLICY_PATH.TERMS,
  privacy: POLICY_PATH.PRIVACY,
} as const satisfies Partial<Record<ConsentName, string>>;

/**
 * 가입 동의.
 *
 * **필수와 선택을 눈으로 가른다.** 마케팅 수신까지 묶어 "전부 동의" 로 받으면 그건 동의가 아니라 대가다 — 칸마다 (필수)
 * (선택)을 적고, 전체 동의는 있어도 선택 동의를 끌 수 있게 둔다.
 *
 * **읽을 문서로 가는 길을 함께 둔다.** 동의를 받으면서 무엇에 동의하는지 못 읽게 하면 그 동의는 아무 뜻이 없다. 새 탭으로
 * 열어 적던 것이 날아가지 않게 한다.
 */
export function SignupConsent({
  value,
  onChange,
  error,
}: {
  value: ConsentState;
  onChange: (next: ConsentState) => void;
  /** 필수 동의를 안 한 채 보내려 했을 때의 문구 */
  error?: string | undefined;
}) {
  const t = useT();
  const groupId = useId();
  const errorId = useId();

  const allChecked = CONSENT.every((name) => value[name]);
  const toggleAll = () => {
    const next = !allChecked;
    onChange({ terms: next, privacy: next, marketing: next });
  };

  return (
    <fieldset
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
      className="flex flex-col gap-3 rounded-sm border border-[var(--border)] p-4"
    >
      <legend className="px-1 text-xs font-medium text-[var(--fg-secondary)]">{t('auth.consent')}</legend>

      <label className="flex items-center gap-2.5 text-[13px] font-medium">
        <input type="checkbox" checked={allChecked} onChange={toggleAll} />
        {t('auth.consentAll')}
      </label>

      <ul className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
        {CONSENT.map((name) => {
          const href = name in DOCUMENT ? DOCUMENT[name as keyof typeof DOCUMENT] : null;
          return (
            <li key={name}>
              <label className="flex items-start gap-2.5 text-[13px] leading-relaxed">
                <input
                  type="checkbox"
                  name={`${groupId}-${name}`}
                  checked={value[name]}
                  onChange={(e) => onChange({ ...value, [name]: e.target.checked })}
                  className="mt-0.5"
                />
                <span>
                  <span className="text-[var(--fg-muted)]">
                    {t(CONSENT_REQUIRED[name] ? 'auth.consentRequired' : 'auth.consentOptional')}
                  </span>{' '}
                  {t(`auth.consent.${name}` as const)}
                  {href && (
                    <>
                      {' '}
                      {/* 새 탭으로 연다 — 읽으러 갔다가 적던 것이 날아가면 안 읽게 된다 */}
                      <Link href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                        {t('auth.consentRead')}
                      </Link>
                    </>
                  )}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <p id={errorId} role="alert" className="text-[12px] text-accent">
          {error}
        </p>
      )}
    </fieldset>
  );
}
