/**
 * 주문 버튼이 왜 안 눌리는지.
 *
 * **못 누르는 버튼은 왜 못 누르는지 말해야 한다.** 이 저장소는 `disabled`
 * 대신 `aria-disabled` 를 쓰기로 이미 정했다 — 못 누르는 버튼이 초점을
 * 못 받으면 이유를 들을 자리조차 없기 때문이다. 그런데 초점은 받게 해
 * 놓고 정작 이유를 아무 데도 안 적어 두면 반만 한 것이다. 낭독기에는
 * "결제하기, 사용 불가" 만 들리고, 다섯 가지 중 무엇이 막는지는 알 수 없다.
 *
 * 조건이 하나면 버튼 이름을 바꾸면 된다(상품 옵션의 구매하기가 그렇다).
 * 결제는 조건이 다섯이라 **어느 것이 막는지**를 골라야 하고, 그 고르는
 * 규칙은 화면이 아니라 여기 있다.
 *
 * 차례는 **사용자가 손대야 하는 순서**다. 배송지가 없으면 약관에 동의해도
 * 소용없으니 배송지를 먼저 말한다.
 */

export const ORDER_BLOCKER = ['empty', 'broken', 'address', 'agree'] as const;

export type OrderBlocker = (typeof ORDER_BLOCKER)[number];

export function orderBlocker(input: {
  /** 주문서에 올라온 줄 수 */
  readonly lineCount: number;
  /** 그중 지금 살 수 없는 줄 수 (품절·가격변동 등) */
  readonly brokenCount: number;
  readonly hasAddress: boolean;
  readonly agreed: boolean;
}): OrderBlocker | null {
  if (input.lineCount <= 0) return 'empty';
  if (input.brokenCount > 0) return 'broken';
  if (!input.hasAddress) return 'address';
  if (!input.agreed) return 'agree';
  return null;
}
