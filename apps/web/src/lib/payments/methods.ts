import { PAYMENT_METHOD_CODE } from '@shop/core';
import type { PaymentMethodInput } from '@shop/contract';

/**
 * **어떤 결제 수단을 내놓을 것인가.**
 *
 * 간편결제는 토스 결제창에서 제공사(카카오페이·네이버페이…)를 함께 지정해야 하는데
 * 그 연동이 아직 없다. 실제 키가 든 환경에서 이것만 Mock 으로 빠지면 **결제창도 안
 * 뜨는데 주문이 결제 완료가 된다** — 가장 나쁜 종류의 불일치다.
 *
 * 그래서 두 군데가 막고 있었다. 화면은 그 수단을 감추고(`checkout-form`), 결제를
 * 거는 쪽은 창 대신 Mock 으로 보낸다(`pay-order`). **그런데 둘이 저마다 'EASY_PAY'
 * 를 적어 두고 있었다.** 연동 안 된 수단이 하나 더 생겨 한쪽에만 적히는 날, 화면은
 * 멀쩡히 내놓는데 결제창은 안 열린다 — 막으려던 바로 그 일이 돌아온다.
 *
 * 'server-only' 를 걸지 않는다. 두 쓰는 쪽이 모두 브라우저에서 돈다.
 */

/** 아직 결제창을 열 수 없는 수단. */
export const WINDOW_UNSUPPORTED_METHOD = ['EASY_PAY'] as const satisfies readonly PaymentMethodInput[];

/**
 * 결제창에 넘길 수 있는 수단.
 *
 * **타입도 같은 목록에서 나온다.** 토스 어댑터(`client.ts`)가 받는 수단을 손으로
 * 적어 두면 그것이 세 번째 자리가 된다 — 목록에 하나를 더하는 날 타입만 옛 셋을
 * 그대로 받아 준다. 여기서 빼면 어댑터 쪽이 컴파일에서 먼저 진다.
 */
export type WindowMethod = Exclude<
  PaymentMethodInput,
  (typeof WINDOW_UNSUPPORTED_METHOD)[number]
>;

export const canOpenWindow = (method: PaymentMethodInput): method is WindowMethod =>
  !(WINDOW_UNSUPPORTED_METHOD as readonly PaymentMethodInput[]).includes(method);

/**
 * 이 환경에서 고를 수 있는 수단.
 *
 * Mock 으로 도는 환경에서는 전부 내놓는다 — 어차피 결제창을 안 열고, 포트폴리오를
 * 보는 사람에게 수단 넷이 다 보이는 편이 낫다.
 */
export const offeredMethods = (realGateway: boolean): readonly PaymentMethodInput[] =>
  realGateway ? PAYMENT_METHOD_CODE.filter(canOpenWindow) : PAYMENT_METHOD_CODE;

/**
 * 결제 화면을 열었을 때 미리 골라 둔 수단.
 *
 * **고르개에 없는 것을 골라 두면 아무 칸도 선택으로 안 보인다.** 라디오 묶음은 고른
 * 것 하나만 탭 순서에 두므로, 선택이 목록 밖이면 낭독기는 "아무것도 안 골랐다" 고
 * 읽는데 폼은 그 수단으로 보낸다 — 들은 것과 보내는 것이 갈린다.
 */
export const DEFAULT_PAYMENT_METHOD: PaymentMethodInput = 'CARD';
