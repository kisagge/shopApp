import { describe, it, expect } from 'vitest';
import { CLOSURE_CONFIRM_PHRASE, CLOSURE_ERROR } from '@shop/core';
import { closeAccountSchema } from '../src';

/**
 * 회원 탈퇴 계약.
 *
 * 확인 문구를 **서버에서도 본다.** 화면에서만 검사하면 주소를 직접 부르는 요청은 그대로
 * 통과하고, 되돌릴 수 없는 동작에 확인이 없어진다.
 *
 * 탈퇴 자체를 막는 검사는 `apps/web` 에 있다(`close-account.test.ts` 가 core 의
 * `PHRASE_MISMATCH` 를 본다). 여기서 보는 것은 **창구 경계**다 — 본문이 파싱될 때 이미
 * 거절되는지. 두 겹을 따로 못 박아 둔다: 한쪽을 지워도 다른 쪽 검사가 진다.
 */
describe('확인 문구', () => {
  it('정해진 문구면 받는다', () => {
    const r = closeAccountSchema.safeParse({ phrase: CLOSURE_CONFIRM_PHRASE });
    expect(r.success).toBe(true);
    // 보내지 않으면 리뷰는 남긴다 — 지우는 쪽이 기본값이면 되돌릴 수 없는 일이 더 커진다
    expect(r.success && r.data.eraseReviews).toBe(false);
  });

  it('앞뒤 공백은 지우고 본다', () => {
    expect(closeAccountSchema.safeParse({ phrase: `  ${CLOSURE_CONFIRM_PHRASE}  ` }).success).toBe(true);
  });

  it.each([
    ['짧게 적은 것', '탈퇴'],
    ['한 글자 더 붙인 것', `${CLOSURE_CONFIRM_PHRASE}!`],
    ['빈 것', ''],
  ])('%s 은 받지 않는다', (_label, phrase) => {
    const r = closeAccountSchema.safeParse({ phrase });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe(CLOSURE_ERROR.PHRASE_MISMATCH);
  });

  it('리뷰를 함께 지울지 고를 수 있다', () => {
    expect(closeAccountSchema.parse({ phrase: CLOSURE_CONFIRM_PHRASE, eraseReviews: true }).eraseReviews).toBe(true);
  });
});
