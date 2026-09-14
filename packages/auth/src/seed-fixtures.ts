/**
 * 로컬 시드 계정.
 *
 * 시드 스크립트와 E2E 테스트가 **같은 곳을 본다.** 양쪽에 따로 적어 두면
 * 비밀번호를 바꿨을 때 테스트가 이유 없이 깨지고, 왜 깨졌는지 찾는 데
 * 시간이 든다.
 *
 * 이 파일에는 부작용이 없다 — seed-users.ts 는 임포트만 해도 시드가 돌아서
 * 테스트에서 가져올 수 없다.
 *
 * **비밀이 아니다.** 개발용 데이터베이스를 채우기 위한 고정값이고,
 * 운영 계정과는 아무 관계가 없다.
 */
export const SEED_PASSWORD = 'plain1234!';

export const SEED_ACCOUNT = {
  customer: 'demo@plain.test',
  admin: 'admin@plain.test',
  superAdmin: 'super@plain.test',
  merchant: 'contact@studionoon.test',

  /*
   * **장바구니를 쥐는 검사는 저마다 자기 손님을 쓴다.**
   *
   * 서버 장바구니는 계정에 하나뿐이고, 저장은 통째로 바꾸는 방식이다 —
   * 마지막에 보낸 목록이 곧 결과다. 그래서 두 검사가 한 계정을 나눠 쓰면
   * 한쪽이 비우는 순간 다른 쪽 장바구니가 사라진다. 그런데 이 검사들은
   * 하나같이 "먼저 비우고 담는" 것으로 시작한다.
   *
   * 실제 실패의 흔적이 그대로 남아 있다. 담기 저장은 200 으로 성공했는데,
   * 그 100ms 뒤부터 2초 동안 읽기가 계속 빈 목록이었다 — 같은 쿠키, 같은
   * 계정이다. 그 사이 어드민 검사들은 2초 안에 통과하고 있었으니 서버가
   * 느린 것도 아니었다. 누군가 지운 것이다.
   *
   * 워커를 줄여 가리는 방법도 있지만 그건 증상만 덮는다. 두 사람이 장바구니
   * 하나를 같이 쓰지 않는다는 것이 원래 규칙이다.
   */
  cartOrdering: 'cart-ordering@plain.test',
  cartPayment: 'cart-payment@plain.test',
  cartA11y: 'cart-a11y@plain.test',
  cartBudget: 'cart-budget@plain.test',
  cartLayout: 'cart-layout@plain.test',
  cartLifecycle: 'cart-lifecycle@plain.test',
  cartDeposit: 'cart-deposit@plain.test',
  cartTotal: 'cart-total@plain.test',
  cartCallback: 'cart-callback@plain.test',

  /*
   * **마지막 한 개를 두 사람이 동시에 산다.** 이 둘만은 서로를 상대로 쓰는
   * 계정이라, 하나로는 검사가 성립하지 않는다 — 같은 사람이 두 번 보내는
   * 것은 경쟁이 아니라 중복이고, 그건 다른 자리(order-idempotency)가 본다.
   */
  raceBuyerA: 'race-a@plain.test',
  raceBuyerB: 'race-b@plain.test',

  /*
   * **같은 쿠폰과 같은 포인트로 두 번 결제해 본다.** 이쪽은 한 사람이다 —
   * 쿠폰도 포인트도 계정에 붙어 있어서, 두 사람으로는 겨룰 것이 없다.
   */
  doubleSpender: 'double-spend@plain.test',

  /** 주문 내역을 검색·기간으로 좁혀 본다 — 자기 주문을 만들고 찾는다 */
  orderSearch: 'order-search@plain.test',

  /** 재고를 기준 너머로 내려 가맹점 알림을 부른다 */
  lowStockBuyer: 'low-stock-buyer@plain.test',

  /** 두 줄을 사서 한 줄만 취소한다 — 자기 주문과 자기 장바구니가 있어야 한다 */
  partialCanceler: 'partial-cancel@plain.test',

  /** 두 줄을 받고 한 줄만 반품한다 */
  partialReturner: 'partial-return@plain.test',

  /** 가맹점 상품을 받아 반품한다 — 가맹점이 승인·회수 확인하고 운영진이 환불한다 */
  merchantReturner: 'merchant-return@plain.test',
} as const;

/** 장바구니를 쥐는 계정들. 시드와 E2E 가드가 같은 것을 본다. */
export const CART_ACCOUNTS = [
  'cartOrdering', 'cartPayment', 'cartA11y', 'cartBudget', 'cartLayout', 'cartLifecycle',
  'cartDeposit', 'cartTotal', 'cartCallback', 'raceBuyerA', 'raceBuyerB', 'doubleSpender', 'orderSearch', 'lowStockBuyer',
  'partialCanceler', 'partialReturner', 'merchantReturner',
] as const satisfies readonly (keyof typeof SEED_ACCOUNT)[];
