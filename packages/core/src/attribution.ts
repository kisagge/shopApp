import { USER_ROLE_LABEL, type Actor, type UserRole } from './authz';

/**
 * 운영 화면에서 **누가 했는지** 를 어떻게 적을까. 순수 로직만.
 *
 * 정지를 건 사람(User.suspendedBy), 문의에 답한 사람(Inquiry.answeredById), 리뷰에 답글을
 * 단 사람(Review.repliedById) — 셋 다 **적어 두고 아무 데도 보여 주지 않았다.** 문의 화면은
 * "답변 · 시각" 만, 리뷰 화면은 답글 글만 보여 줘서, 담당자가 여럿인 가게에서 "이 답은 누가
 * 했지" 에 답하려면 감사 로그를 뒤져야 했다. 정지 사유는 화면에 있는데 건 사람은 없었다.
 */

/** 그 일을 한 사람. 계정이 사라졌으면 null */
export interface ActorIdentity {
  readonly id: string;
  readonly name: string;
  readonly role: UserRole;
  readonly merchantId: string | null;
}

/** 운영진 쪽 계정인가 — 가맹점 담당자에게는 이름 대신 이것만 말한다 */
const STAFF_LABEL = '운영진';

/**
 * 보는 사람에 따라 한 사람을 적는 말.
 *
 * · **운영진이 보면 이름과 역할.** 누가 했는지 묻는 자리가 이 화면이다.
 * · **가맹점 담당자가 보면, 같은 가맹점 동료만 이름으로.** 운영진도 가맹점 상품의 문의·리뷰에
 *   답할 수 있는데, 그 운영진의 이름은 바깥 가게에 알릴 것이 아니다. "운영진" 이면 충분하다 —
 *   가맹점이 알아야 하는 것은 "우리 쪽이 아니라 플랫폼이 답했다" 는 사실이다. 다른 가맹점의
 *   담당자가 답하는 일은 없지만(자기 상품에만 답한다), 있더라도 이름은 내보내지 않는다.
 * · **계정이 사라졌으면** 그렇다고 말한다. 빈칸이면 "기록이 없다" 와 구분되지 않는다.
 *
 * @param missing 기록 자체가 없을 때(이 칸이 생기기 전의 행) 쓸 말. 계정이 사라진 것과 다르다.
 */
export function actorLabel(
  viewer: Actor,
  who: { readonly id: string | null; readonly identity: ActorIdentity | null },
  missing: string,
): string {
  if (who.id === null) return missing;
  const person = who.identity;
  if (person === null) return '탈퇴한 계정';

  if (viewer.role === 'MERCHANT') {
    const colleague = person.id === viewer.id
      || (person.role === 'MERCHANT' && person.merchantId !== null && person.merchantId === viewer.merchantId);
    if (colleague) return person.name;
    return person.role === 'ADMIN' || person.role === 'SUPER_ADMIN' ? STAFF_LABEL : '다른 계정';
  }

  return `${person.name} · ${USER_ROLE_LABEL[person.role]}`;
}
