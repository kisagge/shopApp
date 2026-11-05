import { describe, it, expect } from 'vitest';
import { MERCHANT_STATUS, USER_ROLE, merchantStatusNeedsReason } from '@shop/core';
import { updateMerchantStatusSchema, assignRoleSchema } from '../src';

/**
 * 운영 창구의 두 계약 — 가맹점 처분과 권한 부여.
 *
 * **둘 다 검사가 없었다.** 커버리지를 켜 보니 `.refine()` 콜백이 한 번도 안 돌았고, 그
 * 뜻은 **규칙 자체가 증명된 적이 없다**는 것이다. 문구 열쇠(`valid.suspendNeedsReason`
 * 같은 것)로 저장소를 훑어도 어느 검사에도 안 나왔다.
 */

const cuid = 'cmtgrsydv0011x9ohazcdqo6p';

/**
 * **어느 처분에 까닭이 필요한지는 core 가 정한다.**
 *
 * 예전에는 계약과 운영 화면이 각자 `SUSPENDED · TERMINATED` 를 적어 두고 있었다(주석이
 * 그 사고를 적는다). 상태가 하나 늘 때 한쪽만 고치면 **화면은 사유를 안 받고 서버가
 * 튕긴다.** 그래서 손으로 적지 않고 core 에 물어 전수로 돈다.
 */
describe('가맹점 처분', () => {
  it.each(MERCHANT_STATUS.filter(merchantStatusNeedsReason))('%s 은 까닭이 있어야 받는다', (status) => {
    const empty = updateMerchantStatusSchema.safeParse({ status });
    expect(empty.success).toBe(false);
    expect(empty.error?.issues[0]?.message).toBe('valid.suspendNeedsReason');
    // 공백만 적은 것도 안 적은 것이다 — 앞뒤를 지운 뒤에 센다
    expect(updateMerchantStatusSchema.safeParse({ status, reason: '   ' }).success).toBe(false);
    expect(updateMerchantStatusSchema.safeParse({ status, reason: '서류 미비' }).success).toBe(true);
  });

  it.each(MERCHANT_STATUS.filter((s) => !merchantStatusNeedsReason(s)))('%s 은 까닭이 없어도 받는다', (status) => {
    expect(updateMerchantStatusSchema.safeParse({ status }).success).toBe(true);
  });

  // 그물이 헛돌지 않는지 — 양쪽 목록이 비어 있으면 위의 루프가 조용히 통과한다
  it('까닭이 필요한 처분과 아닌 처분이 둘 다 있다', () => {
    expect(MERCHANT_STATUS.filter(merchantStatusNeedsReason).length).toBeGreaterThan(0);
    expect(MERCHANT_STATUS.filter((s) => !merchantStatusNeedsReason(s)).length).toBeGreaterThan(0);
  });

  it('모르는 처분은 받지 않는다', () => {
    expect(updateMerchantStatusSchema.safeParse({ status: 'DELETED', reason: 'x' }).success).toBe(false);
  });
});

/**
 * **역할과 소속은 함께 맞아야 한다.**
 *
 * 가맹점으로 올리면서 소속을 비우면 **만들어 봐야 로그인만 되는 계정**이 된다 —
 * `hasPermission` 이 소속 없는 가맹점에게 아무 권한도 주지 않기 때문이다(그 자리도
 * `packages/core` 에서 따로 못 박았다). 반대로 운영진에게 소속이 붙으면 그 범위가
 * 조회에 섞여, 가맹점 하나만 보이는 운영자가 생긴다.
 *
 * 두 규칙을 **따로** 본다. 하나만 있어도 "역할과 소속이 맞는다" 는 문장은 반쪽이다.
 */
describe('권한 부여', () => {
  const base = { reason: '신규 입점' };

  it('가맹점으로 올리려면 소속이 있어야 한다', () => {
    const r = assignRoleSchema.safeParse({ ...base, role: 'MERCHANT' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.merchantNeedsScope');
    expect(assignRoleSchema.safeParse({ ...base, role: 'MERCHANT', merchantId: cuid }).success).toBe(true);
  });

  it.each(USER_ROLE.filter((r) => r !== 'MERCHANT'))('%s 에게는 소속을 붙일 수 없다', (role) => {
    const r = assignRoleSchema.safeParse({ ...base, role, merchantId: cuid });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('valid.nonMerchantNoScope');
    expect(assignRoleSchema.safeParse({ ...base, role }).success).toBe(true);
  });

  /** 역할 목록을 계약이 다시 적지 않는다 — 베낀 목록은 늘 때 한쪽만 늘어난다 */
  it('core 의 역할을 그대로 받는다', () => {
    for (const role of USER_ROLE) {
      const input = role === 'MERCHANT' ? { ...base, role, merchantId: cuid } : { ...base, role };
      expect(assignRoleSchema.safeParse(input).success, role).toBe(true);
    }
  });

  it('까닭 없이는 올리지 않는다 — 기록에 남을 글이다', () => {
    expect(assignRoleSchema.safeParse({ role: 'ADMIN', reason: '  ' }).success).toBe(false);
  });
});
