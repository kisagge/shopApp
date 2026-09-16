import { describe, it, expect } from 'vitest';
import { actorLabel, type ActorIdentity } from '../src/attribution';
import type { Actor } from '../src/authz';

/**
 * 운영 화면에 "누가 했는지" 를 적는 말.
 *
 * 정지를 건 사람·문의에 답한 사람·리뷰에 답글을 단 사람 — 셋 다 적어 두기만 하고 보여 주지 않았다.
 */

const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-ma', role: 'MERCHANT', merchantId: 'm-a' };

const staff: ActorIdentity = { id: 'u-park', name: '박운영', role: 'ADMIN', merchantId: null };
const owner: ActorIdentity = { id: 'u-root', name: '최총괄', role: 'SUPER_ADMIN', merchantId: null };
const colleague: ActorIdentity = { id: 'u-kim', name: '김담당', role: 'MERCHANT', merchantId: 'm-a' };
const stranger: ActorIdentity = { id: 'u-lee', name: '이담당', role: 'MERCHANT', merchantId: 'm-b' };

const by = (identity: ActorIdentity) => ({ id: identity.id, identity });

describe('운영진이 볼 때', () => {
  it('이름과 역할을 적는다 — 누가 했는지 묻는 자리가 이 화면이다', () => {
    expect(actorLabel(admin, by(staff), '—')).toBe('박운영 · 관리자');
    expect(actorLabel(admin, by(colleague), '—')).toBe('김담당 · 가맹점');
  });
});

describe('가맹점 담당자가 볼 때', () => {
  it('같은 가맹점 동료는 이름으로', () => {
    expect(actorLabel(merchantA, by(colleague), '—')).toBe('김담당');
  });

  it('자기 자신도 이름으로', () => {
    const me: ActorIdentity = { id: 'u-ma', name: '나담당', role: 'MERCHANT', merchantId: 'm-a' };
    expect(actorLabel(merchantA, by(me), '—')).toBe('나담당');
  });

  it('운영진의 이름은 내보내지 않는다 — "운영진" 이면 충분하다', () => {
    /*
     * 운영진도 가맹점 상품의 문의·리뷰에 답한다. 가맹점이 알아야 하는 것은 "플랫폼이 답했다" 이지
     * 그 사람의 이름이 아니다.
     */
    expect(actorLabel(merchantA, by(staff), '—')).toBe('운영진');
    expect(actorLabel(merchantA, by(owner), '—')).toBe('운영진');
  });

  it('다른 가맹점 사람의 이름도 내보내지 않는다', () => {
    expect(actorLabel(merchantA, by(stranger), '—')).toBe('다른 계정');
  });

  it('가맹점이 없는 가맹점 계정끼리를 동료로 보지 않는다', () => {
    const orphanViewer: Actor = { id: 'u-x', role: 'MERCHANT', merchantId: null };
    const orphan: ActorIdentity = { id: 'u-y', name: '무소속', role: 'MERCHANT', merchantId: null };
    expect(actorLabel(orphanViewer, by(orphan), '—')).toBe('다른 계정');
  });
});

describe('기록이 비었을 때', () => {
  it('누가 했는지 적히기 전의 행이면 부르는 쪽의 말을 쓴다', () => {
    expect(actorLabel(admin, { id: null, identity: null }, '기록 없음')).toBe('기록 없음');
  });

  it('적혀 있는데 계정이 사라졌으면 그렇다고 말한다 — 빈칸이면 "기록 없음" 과 구분되지 않는다', () => {
    expect(actorLabel(admin, { id: 'u-gone', identity: null }, '기록 없음')).toBe('탈퇴한 계정');
  });
});
