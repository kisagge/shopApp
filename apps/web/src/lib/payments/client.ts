/**
 * 브라우저에서 토스 결제창을 띄운다.
 *
 * SDK 를 번들에 넣지 않고 필요할 때 script 태그로 불러온다. 결제창은 주문
 * 마지막 단계에서만 쓰는데, 첫 화면부터 들고 다니면 상품을 구경만 하는
 * 사람에게도 값을 치르게 된다.
 */

const SDK_SRC = 'https://js.tosspayments.com/v2/standard';

/**
 * 클라이언트 키가 실제로 쓸 수 있는 형식인가.
 *
 * 서버의 시크릿 키 검사와 같은 이유로 둔다 — .env.example 을 복사해 만든
 * 플레이스홀더가 진짜 키로 취급되면, Mock 으로 도는 줄 알고 개발하다
 * 결제창에서 처음 실패를 만난다.
 */
export function isUsableClientKey(key: string | undefined): key is string {
  if (!key) return false;
  return /^(test|live)_(ck|gck)_[A-Za-z0-9]{20,}$/.test(key.trim());
}

interface TossPaymentInstance {
  requestPayment(options: Record<string, unknown>): Promise<void>;
}
interface TossPaymentsSdk {
  payment(options: { customerKey: string }): TossPaymentInstance;
}
declare global {
  interface Window {
    TossPayments?: (clientKey: string) => TossPaymentsSdk;
  }
}

let loading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.TossPayments) return Promise.resolve();
  // 이미 불러오는 중이면 그 약속을 같이 기다린다. 버튼을 두 번 누르면
  // script 태그가 두 개 붙고 그중 하나는 영원히 대기한다.
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null; // 다음 시도에서 다시 붙일 수 있게 되돌린다
      reject(new Error('결제 모듈을 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

export interface OpenPaymentInput {
  readonly clientKey: string;
  /**
   * 결제창을 다시 열었을 때 같은 사람으로 알아보게 하는 키.
   * **회원 id 를 그대로 쓰지 않는다** — 결제창은 외부 서비스이고,
   * 우리 사용자 id 를 넘겨 줄 이유가 없다.
   */
  readonly customerKey: string;
  readonly orderNo: string;
  readonly orderName: string;
  readonly amount: number;
  readonly method: 'CARD' | 'TRANSFER' | 'VIRTUAL_ACCOUNT';
  readonly origin: string;
}

/**
 * 결제창을 연다. 성공하면 토스가 successUrl 로 **리다이렉트**하므로
 * 이 함수 뒤의 코드는 보통 실행되지 않는다.
 *
 * 금액을 함께 넘기지만 서버는 이 값을 믿지 않는다. 승인은 주문에 저장된
 * 금액으로만 이뤄지고, 돌아온 금액이 다르면 거절한다.
 */
export async function openPaymentWindow(input: OpenPaymentInput): Promise<void> {
  await loadSdk();
  const factory = window.TossPayments;
  if (!factory) throw new Error('결제 모듈을 불러오지 못했습니다.');

  const payment = factory(input.clientKey).payment({ customerKey: input.customerKey });

  await payment.requestPayment({
    method: input.method,
    amount: { currency: 'KRW', value: input.amount },
    // 토스의 orderId 는 우리 주문번호다. 같은 주문번호로 두 번 승인되는 것을
    // 토스가 막아 준다 — 우리 멱등 처리와 겹치지만 겹치는 편이 낫다.
    orderId: input.orderNo,
    orderName: input.orderName,
    successUrl: `${input.origin}/checkout/success`,
    failUrl: `${input.origin}/checkout/fail`,
    ...(input.method === 'CARD' ? { card: { useEscrow: false, flowMode: 'DEFAULT' } } : {}),
    ...(input.method === 'VIRTUAL_ACCOUNT'
      ? { virtualAccount: { cashReceipt: { type: '소득공제' }, useEscrow: false } }
      : {}),
  });
}
