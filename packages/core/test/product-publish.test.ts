import { describe, it, expect } from 'vitest';
import {
  needsPublishPermission, isVisibleStatus, isAwaitingReview,
  PRODUCT_STATUS, PRODUCT_STATUS_LABEL, VISIBLE_STATUS, MERCHANT_SELECTABLE_STATUS,
} from '../src/product-publish';
import { permissionsOf } from '../src/authz';

const NEVER_PUBLISHED = { publishedAt: null };
const PUBLISHED = { publishedAt: new Date('2026-01-01') };

describe('무엇이 게시인가', () => {
  it('매대에 보이는 상태는 판매중과 품절뿐이다', () => {
    /*
     * 스토어프론트 조회가 status in (ACTIVE, SOLD_OUT) 으로 거른다.
     * 여기가 그것과 어긋나면 권한은 통과하는데 화면에는 뜨는 상태가 생긴다.
     */
    expect([...VISIBLE_STATUS].sort()).toEqual(['ACTIVE', 'SOLD_OUT']);
  });

  it('작성 중·검수 대기·숨김은 매대가 아니다', () => {
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'HIDDEN'] as const) {
      expect(isVisibleStatus(status), status).toBe(false);
    }
  });

  it('모든 상태에 사람이 읽는 이름이 있다', () => {
    for (const status of PRODUCT_STATUS) {
      expect(PRODUCT_STATUS_LABEL[status], status).toBeTruthy();
    }
  });
});

describe('게시 권한이 필요한 때', () => {
  it('한 번도 게시된 적 없는 상품을 매대에 올릴 때', () => {
    expect(needsPublishPermission({ to: 'ACTIVE', ...NEVER_PUBLISHED })).toBe(true);
    expect(needsPublishPermission({ to: 'SOLD_OUT', ...NEVER_PUBLISHED })).toBe(true);
  });

  it('매대가 아닌 상태로 가는 것은 자유다', () => {
    // 내리는 것은 막을 이유가 없다. 가맹점이 자기 상품을 못 내리면 곤란하다.
    for (const to of ['DRAFT', 'PENDING_REVIEW', 'HIDDEN'] as const) {
      expect(needsPublishPermission({ to, ...NEVER_PUBLISHED }), to).toBe(false);
    }
  });

  it('한 번 게시된 상품은 다시 올릴 때 권한이 필요 없다', () => {
    /*
     * 심사는 "이 상품이 이 매대에 어울리는가" 를 한 번 보는 것이고, 그
     * 판단은 잠시 내렸다 올린다고 달라지지 않는다. 매번 막으면 품절 처리나
     * 사진 교체 때마다 운영진을 기다려야 한다 — 검수가 아니라 발목이다.
     */
    expect(needsPublishPermission({ to: 'ACTIVE', ...PUBLISHED })).toBe(false);
  });
});

describe('가맹점이 고를 수 있는 상태', () => {
  it('매대에 보이는 상태는 하나도 없다', () => {
    for (const status of MERCHANT_SELECTABLE_STATUS) {
      expect(isVisibleStatus(status), status).toBe(false);
    }
  });

  it('검수를 요청할 길이 있다', () => {
    // 권한을 뺐으면 대신 요청할 문을 열어 줘야 한다. 없으면 작성만 하고 끝난다.
    expect(MERCHANT_SELECTABLE_STATUS).toContain('PENDING_REVIEW');
  });

  it('검수 대기는 대기줄에 올라온 상태다', () => {
    expect(isAwaitingReview('PENDING_REVIEW')).toBe(true);
    expect(isAwaitingReview('DRAFT')).toBe(false);
  });
});

describe('권한 표', () => {
  it('가맹점에게는 게시 권한이 없다', () => {
    /*
     * 갖고 있으면 product:write 와 아무것도 구분하지 못한다 — 쓸 수 있는
     * 사람이 곧 올릴 수 있는 사람이라 권한을 둘로 나눈 뜻이 없어진다.
     */
    expect(permissionsOf('MERCHANT')).not.toContain('product:publish');
    expect(permissionsOf('MERCHANT')).toContain('product:write');
  });

  it('운영진에게는 있다', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
      expect(permissionsOf(role), role).toContain('product:publish');
    }
  });

  it('고객에게는 둘 다 없다', () => {
    expect(permissionsOf('CUSTOMER')).not.toContain('product:write');
    expect(permissionsOf('CUSTOMER')).not.toContain('product:publish');
  });
});
