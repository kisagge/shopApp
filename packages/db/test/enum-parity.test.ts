import { describe, it, expect } from 'vitest';
import * as core from '@shop/core';
import * as prisma from '../src/generated/enums';

/**
 * DB 의 enum 과 도메인 상수가 **같은 집합인지** 지킨다. 어긋나면 규칙이 DB 에 반영되지 않는다.
 *
 * **짝을 손으로 적고 있었다.** 그래서 열여섯 개 중 여섯만 보고 있었고, 나머지 열은 아무도 안 본
 * 채로 있었다 — 상품 상태·포인트 사유·알림 종류·쿠폰 종류·신고 사유·문의 주제·방침 종류·공지
 * 종류·가맹점 상태·정산 상태. 더 나쁜 것은 `core/point.ts` 의 주석이 **"정합성 검사가 지킨다"**
 * 고 적어 둔 것이다 — 그 검사는 없었다. 값이 지금 다 맞아서 조용했을 뿐이다.
 *
 * 그래서 짝을 **이름 규칙으로 찾는다**: Prisma 의 `PointReason` ↔ core 의 `POINT_REASON`.
 * enum 을 하나 더하면 짝이 없다는 이유로 이 검사가 먼저 진다 — 손 목록은 늘 늦게 자란다
 * (`rate-limit-coverage` 가 같은 결론에 먼저 닿았다).
 */

/** `PointReason` → `POINT_REASON` */
const screamingSnake = (name: string): string =>
  name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

/**
 * 이름 규칙으로는 못 찾는 짝. **값 자체가 아니라 이름만 다른 경우다.**
 *
 * 결제 상태·수단은 토스가 쓰는 코드를 그대로 받아 `…_CODE` 로 부른다 — 그 이름이 "우리가 정한
 * 것이 아니라 받아 온 값" 이라는 뜻을 담고 있어 바꾸지 않는다.
 */
const ALIAS: Readonly<Record<string, string>> = {
  PaymentStatus: 'PAYMENT_STATUS_CODE',
  PaymentMethod: 'PAYMENT_METHOD_CODE',
};

/**
 * core 에 짝이 없어도 되는 enum 과 **그 이유**.
 *
 * 이유 없이 이름만 적는 것은 손 목록으로 되돌아가는 것과 같다.
 */
const EXEMPT: Readonly<Record<string, string>> = {
  AnalyticsConsent:
    '동의 여부를 담는 두 값(GRANTED·DENIED)뿐이고, 규칙은 "DENIED 가 아니면 수집" 한 줄이다 — core 에 목록을 둘 까닭이 없다.',
};

/** 생성된 파일에서 enum 만 고른다(타입 별칭과 함수는 런타임에 객체가 아니다) */
function prismaEnums(): [string, readonly string[]][] {
  const found: [string, readonly string[]][] = [];
  for (const [name, value] of Object.entries(prisma)) {
    if (typeof value !== 'object' || value === null) continue;
    const values = Object.values(value);
    if (values.length > 0 && values.every((v) => typeof v === 'string')) {
      found.push([name, values]);
    }
  }
  return found;
}

const coreList = (name: string): readonly string[] | null => {
  const key = ALIAS[name] ?? screamingSnake(name);
  const value: unknown = Reflect.get(core, key);
  return Array.isArray(value) && value.every((v) => typeof v === 'string') ? value : null;
};

const ENUMS = prismaEnums();

describe('enum 정합성', () => {
  it('훑을 enum 이 실제로 있다', () => {
    // 생성 파일을 못 읽으면 아래 검사가 전부 통과해 버린다
    expect(ENUMS.length).toBeGreaterThan(10);
  });

  it('면제 목록에 사라진 enum 이 없다', () => {
    const names = new Set(ENUMS.map(([name]) => name));
    for (const name of Object.keys(EXEMPT)) expect(names, name).toContain(name);
    for (const name of Object.keys(ALIAS)) expect(names, name).toContain(name);
  });

  it.each(ENUMS.filter(([name]) => !(name in EXEMPT)))(
    '%s 는 core 에 같은 집합의 목록이 있다',
    (name, values) => {
      const list = coreList(name);

      expect(list, `core 에 ${ALIAS[name] ?? screamingSnake(name)} 가 없다 — 짝을 만들거나 면제에 이유를 적으세요`)
        .not.toBeNull();
      expect([...list!].toSorted(), name).toEqual([...values].toSorted());
    },
  );
});

/**
 * **이름표는 사전이 가진 것도 있고 core 가 가진 것도 있다.** 운영 화면에서 쓰는 표는 core 에
 * 두었고(한국어로 두기로 한 자리), 손님 화면 것은 사전에 있다(apps/web 의 enum-labels 검사가 본다).
 * 여기서는 core 가 가진 표만 본다 — 값이 하나 늘면 표에 빈칸이 생긴다.
 */
describe('core 가 가진 이름표', () => {
  const LABELED: readonly [string, readonly string[], Readonly<Record<string, string>>][] = [
    ['OrderStatus', core.ORDER_STATUS, core.ORDER_STATUS_LABEL],
    ['UserRole', core.USER_ROLE, core.USER_ROLE_LABEL],
    ['PaymentStatus', core.PAYMENT_STATUS_CODE, core.PAYMENT_STATUS_LABEL],
    ['ProductStatus', core.PRODUCT_STATUS, core.PRODUCT_STATUS_LABEL],
    ['CouponKind', core.COUPON_KIND, core.COUPON_KIND_LABEL],
    ['MerchantStatus', core.MERCHANT_STATUS, core.MERCHANT_STATUS_LABEL],
    ['SettlementStatus', core.SETTLEMENT_STATUS, core.SETTLEMENT_STATUS_LABEL],
    ['PolicyKind', core.POLICY_KIND, core.POLICY_KIND_LABEL],
  ];

  it.each(LABELED)('%s 의 모든 값에 이름표가 있다', (_name, values, labels) => {
    for (const value of values) expect(labels[value], value).toBeTruthy();
  });

  it.each(LABELED)('%s 의 이름표에 없는 값이 섞여 있지 않다', (_name, values, labels) => {
    expect(Object.keys(labels).toSorted()).toEqual([...values].toSorted());
  });
});
