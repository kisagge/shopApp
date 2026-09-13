import 'server-only';
import { cache } from 'react';
import { DEFAULT_SHIPPING, shippingPolicyFrom, type ShippingPolicy } from '@shop/core';
import { prisma } from '@shop/db';

/**
 * 지금 이 가게의 배송비 정책.
 *
 * **값은 운영이 정하고 규칙은 코드가 갖는다.** 무료배송 기준을 5만원에서
 * 3만원으로 내리는 것은 배포할 일이 아니라 그날 결정할 일이다. 반대로 "무료
 * 기준을 넘으면 기본료를 받지 않는다" 는 규칙까지 데이터로 만들면 아무도 그
 * 동작을 읽을 수 없게 된다.
 *
 * **요청 안에서 한 번만 읽는다.** 상품 화면·장바구니 견적·배송지 폼이 저마다
 * 물으면 한 화면에 같은 조회가 여러 번 나간다 — `getViewer` 와 같은 결이다.
 *
 * **줄이 없거나 못 읽으면 코드의 바닥값으로 간다.** 마이그레이션과 시드 사이,
 * 혹은 DB 가 잠깐 흔들릴 때도 가게는 돌아가야 한다. 배송비를 못 읽었다고
 * 결제를 막는 것은 고칠 수 있는 문제를 못 고칠 문제로 키우는 것이다.
 */
export const getShippingPolicy = cache(async (): Promise<ShippingPolicy> => {
  try {
    const row = await prisma.shippingPolicy.findUnique({ where: { id: 'default' } });
    return row ? shippingPolicyFrom(row) : DEFAULT_SHIPPING;
  } catch (error) {
    console.error('[shipping] 정책을 못 읽어 기본값으로 간다', error);
    return DEFAULT_SHIPPING;
  }
});
