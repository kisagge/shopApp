import 'server-only';
import { cache } from 'react';
import { DEFAULT_SHIPPING, shippingPolicyFrom, type ShippingPolicy } from '@shop/core';
import { prisma } from '@shop/db';
import { cachedRead, TAG, TTL } from '~/lib/cache';

/**
 * 지금 이 가게의 배송비 정책.
 *
 * **값은 운영이 정하고 규칙은 코드가 갖는다.** 무료배송 기준을 5만원에서
 * 3만원으로 내리는 것은 배포할 일이 아니라 그날 결정할 일이다. 반대로 "무료
 * 기준을 넘으면 기본료를 받지 않는다" 는 규칙까지 데이터로 만들면 아무도 그
 * 동작을 읽을 수 없게 된다.
 *
 * **요청 안에서 한 번만 읽고, 요청 사이에도 다시 읽지 않는다.** 상품 화면·장바구니
 * 견적·배송지 폼이 저마다 물으면 한 화면에 같은 조회가 여러 번 나간다(`getViewer` 와
 * 같은 결이다). 그리고 이 표는 **한 줄이고 운영이 가끔 고치는 값**인데, 예전에는 그
 * 한 줄을 요청마다 DB 에 물었다 — 손님이 상품을 보고 담고 결제하는 동안 같은 답을
 * 세 번 넘게 받아 왔다. 고치는 창구가 캐시를 턴다(revalidateShipping).
 *
 * **줄이 없거나 못 읽으면 코드의 바닥값으로 간다.** 마이그레이션과 시드 사이,
 * 혹은 DB 가 잠깐 흔들릴 때도 가게는 돌아가야 한다. 배송비를 못 읽었다고
 * 결제를 막는 것은 고칠 수 있는 문제를 못 고칠 문제로 키우는 것이다.
 */
const policyRow = cachedRead(
  () =>
    prisma.shippingPolicy.findUnique({
      where: { id: 'default' },
      // 숫자 세 칸만 읽는다 — 캐시를 지나면 Date 는 문자열이 되는데, 아예 담지 않으면 그 함정이 없다
      select: { baseFee: true, freeThreshold: true, remoteSurcharge: true },
    }),
  { key: ['shipping-policy'], tags: [TAG.shipping], revalidate: TTL.shipping },
);

export const getShippingPolicy = cache(async (): Promise<ShippingPolicy> => {
  /*
   * **바닥값은 캐시에 넣지 않는다.** try 를 캐시 안쪽에 두면 DB 가 잠깐 흔들린 그 한 번이
   * 수명 내내 굳는다 — 멀쩡해진 뒤에도 가게가 계속 기본 배송비로 판다. 넘어지는 것은
   * 여기서 받고, 캐시에는 실제로 읽은 값만 들어간다.
   */
  try {
    const row = await policyRow();
    return row ? shippingPolicyFrom(row) : DEFAULT_SHIPPING;
  } catch (error) {
    console.error('[shipping] 정책을 못 읽어 기본값으로 간다', error);
    return DEFAULT_SHIPPING;
  }
});

/**
 * 고치는 화면이 읽는 정책. **캐시를 지나지 않는다.**
 *
 * **자기가 방금 쓴 값을 보여 줘야 한다.** 매대는 조금 늦어도 되지만(그래서 캐시가 있다), 고치는 폼이
 * 늦으면 운영자는 저장이 안 된 줄 알고 다시 쓰거나, 옛 값을 그대로 다시 저장한다.
 *
 * 캐시를 터는 것만으로는 부족하다. 읽기가 진행 중일 때 저장이 끼어들면, 그 읽기가 **턴 뒤에** 옛 값을
 * 캐시에 넣는다 — 그 뒤로는 수명(300초)이 다할 때까지 옛 값이 나온다. 손님 화면이 정책을 읽는 자리가
 * 늘어난 뒤로 그 틈이 실제로 벌어졌고(검사가 한 번 잡았다), 고치는 화면은 그 틈을 견딜 이유가 없다.
 */
export async function getShippingPolicyFresh(): Promise<ShippingPolicy> {
  try {
    const row = await prisma.shippingPolicy.findUnique({
      where: { id: 'default' },
      select: { baseFee: true, freeThreshold: true, remoteSurcharge: true },
    });
    return row ? shippingPolicyFrom(row) : DEFAULT_SHIPPING;
  } catch (error) {
    console.error('[shipping] 정책을 못 읽어 기본값으로 간다', error);
    return DEFAULT_SHIPPING;
  }
}
