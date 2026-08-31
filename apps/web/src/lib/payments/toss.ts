import 'server-only';
import { won, PaymentError, type PaymentGateway, type PaymentResult } from '@shop/core';

/**
 * 토스페이먼츠 어댑터.
 *
 * 테스트 키로 동작한다. 실제 돈은 움직이지 않지만 API 왕복과 에러 처리는
 * 실제와 같다 — 여기서 잘라 먹으면 프로덕션에서 처음 만나게 된다.
 */

const BASE = 'https://api.tosspayments.com/v1';

interface TossPayment {
  paymentKey: string;
  orderId: string;
  status: string;
  method?: string;
  totalAmount: number;
  approvedAt?: string | null;
  card?: { approveNo?: string } | null;
  virtualAccount?: {
    bankCode?: string; bank?: string; accountNumber: string; dueDate?: string;
  } | null;
}

interface TossError {
  code: string;
  message: string;
}

/** 토스는 한글 method 문자열을 준다. 우리 코드값으로 좁힌다. */
function toMethod(method: string | undefined): PaymentResult['method'] {
  if (!method) return 'CARD';
  if (method.includes('가상계좌')) return 'VIRTUAL_ACCOUNT';
  if (method.includes('계좌이체')) return 'TRANSFER';
  if (method.includes('간편결제')) return 'EASY_PAY';
  return 'CARD';
}

const STATUSES = new Set([
  'READY', 'IN_PROGRESS', 'WAITING_FOR_DEPOSIT', 'DONE',
  'CANCELED', 'PARTIAL_CANCELED', 'ABORTED', 'EXPIRED',
]);

function toStatus(status: string): PaymentResult['status'] {
  return STATUSES.has(status) ? (status as PaymentResult['status']) : 'FAILED';
}

/** 5xx 와 네트워크 오류만 재시도할 만하다. 4xx 는 다시 보내도 같은 답이 온다. */
const RETRYABLE = new Set(['FAILED_INTERNAL_SYSTEM_PROCESSING', 'PROVIDER_ERROR']);

export function createTossGateway(secretKey: string): PaymentGateway {
  // 토스는 시크릿 키를 Basic auth 의 username 으로 쓰고 password 는 빈 값이다
  const auth = `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;

  async function call(path: string, body: unknown, idempotencyKey?: string): Promise<TossPayment> {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}`, {
        method: 'POST',
        headers: {
          Authorization: auth,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(body),
      });
    } catch (cause) {
      // 요청이 나갔는지 알 수 없다. 재시도 가능으로 표시하되 호출부는
      // 멱등키를 반드시 붙여야 한다.
      throw new PaymentError('NETWORK_ERROR', 'PG 에 연결하지 못했습니다.', true, cause);
    }

    const json: unknown = await res.json().catch(() => null);

    if (!res.ok) {
      const err = json as TossError | null;
      throw new PaymentError(
        err?.code ?? `HTTP_${res.status}`,
        err?.message ?? 'PG 요청이 실패했습니다.',
        res.status >= 500 || RETRYABLE.has(err?.code ?? ''),
        json,
      );
    }
    return json as TossPayment;
  }

  function toResult(p: TossPayment): PaymentResult {
    return {
      paymentKey: p.paymentKey,
      approvalNo: p.card?.approveNo ?? null,
      method: toMethod(p.method),
      status: toStatus(p.status),
      amount: won(p.totalAmount),
      approvedAt: p.approvedAt ? new Date(p.approvedAt) : null,
      virtualAccount: p.virtualAccount
        ? {
            bank: p.virtualAccount.bank ?? p.virtualAccount.bankCode ?? '',
            accountNumber: p.virtualAccount.accountNumber,
            dueDate: p.virtualAccount.dueDate ? new Date(p.virtualAccount.dueDate) : null,
          }
        : null,
      raw: p,
    };
  }

  return {
    provider: 'toss',
    async confirm({ paymentKey, orderNo, amount }) {
      // orderId 에 우리 주문번호를 넣는다. 토스가 중복 승인을 막아 준다.
      return toResult(await call('/payments/confirm', { paymentKey, orderId: orderNo, amount }));
    },
    async cancel({ paymentKey, amount, reason, idempotencyKey }) {
      return toResult(
        await call(
          `/payments/${encodeURIComponent(paymentKey)}/cancel`,
          { cancelReason: reason, ...(amount === null ? {} : { cancelAmount: amount }) },
          idempotencyKey,
        ),
      );
    },
  };
}
