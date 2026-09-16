import { describe, it, expect } from 'vitest';
import { canCreateBrand, canEditBrand, isBrandSlug } from '../src/brand';
import type { Actor } from '../src/authz';

/**
 * 브랜드 관리 정책.
 *
 * **주소를 고칠 길이 없었다.** 입점 승인 때 브랜드를 자동으로 만드는데, 한글
 * 이름이면 주소가 `brand-a1b2c3d4` 가 된다. 그 자리의 주석은 "나중에 가맹점이
 * 직접 고칠 수 있다" 고 적어 두었지만 고칠 화면도 API 도 없었다.
 */

const superAdmin: Actor = { id: 'u-s', role: 'SUPER_ADMIN', merchantId: null };
const admin: Actor = { id: 'u-a', role: 'ADMIN', merchantId: null };
const merchantA: Actor = { id: 'u-m', role: 'MERCHANT', merchantId: 'm-a' };
const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };

describe('누가 고칠 수 있는가', () => {
  it('가맹점은 자기 브랜드를 고친다 — 그러라고 만든 화면이다', () => {
    expect(canEditBrand(merchantA, 'm-a')).toBe(true);
  });

  it('남의 브랜드는 못 고친다 — 그 가게의 간판을 바꿔 다는 셈이다', () => {
    expect(canEditBrand(merchantA, 'm-b')).toBe(false);
  });

  it('자사 브랜드는 가맹점의 것이 아니다', () => {
    // merchantId 가 없는 브랜드는 운영진의 것이다
    expect(canEditBrand(merchantA, null)).toBe(false);
  });

  it('운영진은 전부 고친다', () => {
    for (const actor of [admin, superAdmin]) {
      expect(canEditBrand(actor, 'm-a'), actor.role).toBe(true);
      expect(canEditBrand(actor, null), actor.role).toBe(true);
    }
  });

  it('고객은 아무것도 못 고친다', () => {
    expect(canEditBrand(customer, null)).toBe(false);
    expect(canEditBrand(customer, 'm-a')).toBe(false);
  });
});

describe('누가 만들 수 있는가', () => {
  it('운영진만 만든다', () => {
    expect(canCreateBrand(admin)).toBe(true);
    expect(canCreateBrand(superAdmin)).toBe(true);
  });

  it('가맹점에게는 열지 않는다', () => {
    /*
     * 가맹점의 브랜드는 입점 승인 때 하나 생기고 그 하나가 간판이다. 스스로 더
     * 만들 수 있게 하면 한 가맹점이 여러 간판을 달게 되고, 정산·범위 판단이
     * 함께 흔들린다. 고치는 것과 만드는 것은 다른 일이다.
     */
    expect(canCreateBrand(merchantA)).toBe(false);
    expect(canEditBrand(merchantA, 'm-a'), '고치는 것은 열려 있다').toBe(true);
  });

  it('고객은 당연히 못 만든다', () => {
    expect(canCreateBrand(customer)).toBe(false);
  });
});

describe('주소 규칙', () => {
  it('소문자·숫자·붙임표만 받는다', () => {
    expect(isBrandSlug('moor')).toBe(true);
    expect(isBrandSlug('studio-noon')).toBe(true);
    expect(isBrandSlug('brand-a1b2c3d4')).toBe(true);
  });

  it('한글은 받지 않는다 — 인코딩된 주소는 공유될 때 알아볼 수 없다', () => {
    expect(isBrandSlug('무어')).toBe(false);
  });

  it('대문자는 받지 않는다 — 섞이면 같은 곳이 둘로 보인다', () => {
    expect(isBrandSlug('MOOR')).toBe(false);
  });

  it('붙임표로 시작하거나 끝나지 않는다', () => {
    expect(isBrandSlug('-moor')).toBe(false);
    expect(isBrandSlug('moor-')).toBe(false);
    expect(isBrandSlug('moor--seoul')).toBe(false);
  });

  it('너무 짧거나 길면 안 된다', () => {
    expect(isBrandSlug('m')).toBe(false);
    expect(isBrandSlug('a'.repeat(61))).toBe(false);
    expect(isBrandSlug('a'.repeat(60))).toBe(true);
  });
});
