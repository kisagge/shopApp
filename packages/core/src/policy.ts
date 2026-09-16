/**
 * 약관과 개인정보처리방침 — 가게가 손님에게 하는 약속. 순수 로직만.
 *
 * **공지·FAQ 와 섞지 않는다.** 공지는 그때그때의 소식이라 지나면 묻히지만, 약속은 **지금 무엇이 효력을 갖는지**가 늘
 * 분명해야 하고 **언제부터 그랬는지**와 **그전에는 무엇이었는지**가 남아야 한다. 결제 화면이 "동의합니다" 를 받는 순간
 * 읽을 문서가 없으면 그 동의는 무엇에 대한 동의인지 아무도 말할 수 없다.
 */

export const POLICY_KIND = ['TERMS', 'PRIVACY'] as const;
export type PolicyKind = (typeof POLICY_KIND)[number];

export const POLICY_KIND_LABEL: Readonly<Record<PolicyKind, string>> = {
  TERMS: '이용약관',
  PRIVACY: '개인정보처리방침',
};

/** 문서마다 주소가 하나다. 푸터·가입·결제가 모두 이 주소를 가리킨다 */
export const POLICY_PATH: Readonly<Record<PolicyKind, '/terms' | '/privacy'>> = {
  TERMS: '/terms',
  PRIVACY: '/privacy',
};

export function isPolicyKind(value: string): value is PolicyKind {
  return (POLICY_KIND as readonly string[]).includes(value);
}

/**
 * 지금 효력을 갖는가.
 *
 * **시행일이 오늘 뒤면 아직 예고다.** 개인정보처리방침은 바꾸기 전에 미리 알려야 해서 "며칠 뒤부터 이렇게 바뀝니다" 로
 * 먼저 올린다. 그동안 손님이 읽어야 하는 것은 지난 방침이므로, 올라와 있다는 것만으로 효력이 있다고 보면 안 된다.
 */
export function policyInEffect(
  policy: { readonly effectiveAt: Date },
  now: Date = new Date(),
): boolean {
  return policy.effectiveAt.getTime() <= now.getTime();
}

/** 시행 전 문서면 그날까지 며칠 남았는지. 효력이 있으면 null */
export function daysUntilEffective(
  policy: { readonly effectiveAt: Date },
  now: Date = new Date(),
): number | null {
  if (policyInEffect(policy, now)) return null;
  const day = 24 * 60 * 60 * 1000;
  return Math.ceil((policy.effectiveAt.getTime() - now.getTime()) / day);
}

/**
 * 가입할 때 받는 동의.
 *
 * **필수와 선택을 섞지 않는다.** 마케팅 수신까지 묶어 "전부 동의해야 가입" 으로 만들면 그건 동의가 아니라 대가다.
 * 필수는 서비스를 주고받기 위해 꼭 있어야 하는 둘뿐이고, 나머지는 안 해도 가입이 된다.
 */
export const REQUIRED_CONSENT = ['terms', 'privacy'] as const;
export const OPTIONAL_CONSENT = ['marketing'] as const;
export const CONSENT = [...REQUIRED_CONSENT, ...OPTIONAL_CONSENT] as const;
export type ConsentName = (typeof CONSENT)[number];

export const CONSENT_REQUIRED: Readonly<Record<ConsentName, boolean>> = {
  terms: true,
  privacy: true,
  marketing: false,
};

/** 필수 동의를 다 받았는가. 화면과 계약이 같은 함수를 본다 */
export function consentSatisfied(given: Partial<Record<ConsentName, boolean>>): boolean {
  return REQUIRED_CONSENT.every((name) => given[name] === true);
}

/** 아직 체크하지 않은 필수 동의. 화면이 어느 칸을 짚을지 정할 때 쓴다 */
export function missingConsent(given: Partial<Record<ConsentName, boolean>>): ConsentName[] {
  return REQUIRED_CONSENT.filter((name) => given[name] !== true);
}

/**
 * 동의한 시각으로 남긴다 — 무엇에 동의했는지는 그때 효력이 있던 방침이 말한다.
 *
 * 동의 기록에 문서 내용을 복사해 두는 방법도 있지만, 사람마다 문서 한 벌을 안고 있게 된다. 방침의 지난 이력이 시각으로
 * 이어져 있으므로(PolicyRevision), 시각 하나면 그날 무엇에 동의했는지 되짚을 수 있다.
 */
export interface ConsentRecord {
  readonly termsAgreedAt: Date | null;
  readonly marketingAgreedAt: Date | null;
}

/** 마케팅 수신에 동의한 상태인가 */
export function marketingOptedIn(record: Pick<ConsentRecord, 'marketingAgreedAt'>): boolean {
  return record.marketingAgreedAt !== null;
}
