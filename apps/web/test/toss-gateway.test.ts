import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PaymentError, won } from '@shop/core';

const { createTossGateway } = await import('~/lib/payments/toss');

/**
 * 토스페이먼츠 어댑터 — **돈이 오가는 길의 통역.**
 *
 * 138줄에 검사가 없었다. 모의 게이트웨이로 도는 길은 e2e 가 밟지만(`PAYMENT_GATEWAY=mock`),
 * 진짜 키가 꽂혔을 때 도는 코드는 아무도 안 봤다 — 그 파일 머리에 적힌 말이 그대로다:
 * "여기서 잘라 먹으면 프로덕션에서 처음 만나게 된다."
 *
 * 여기서 지키는 것은 **통역이 뜻을 바꾸지 않는가**이다. 모르는 상태를 성공으로 읽거나,
 * 다시 보내면 안 되는 요청을 재시도 가능으로 표시하거나, 취소에 멱등키를 안 붙이면
 * 그 값은 전부 돈으로 치른다.
 */

const KEY = 'test_sk_abc';
const gateway = () => createTossGateway(KEY);

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const ok = (body: Record<string, unknown>) => ({ ok: true, status: 200, json: async () => body });
const fail = (status: number, body: unknown) => ({ ok: false, status, json: async () => body });

const payment = (over: Record<string, unknown> = {}) => ({
  paymentKey: 'pk_1', orderId: '20260903-0000001', status: 'DONE',
  method: '카드', totalAmount: 289_000, approvedAt: '2026-09-03T04:05:06+09:00',
  card: { approveNo: '00012345' }, ...over,
});

const lastCall = () => fetchMock.mock.calls.at(-1)!;
const lastInit = () => lastCall()[1] as RequestInit & { headers: Record<string, string> };
const sentBody = (): Record<string, unknown> => {
  const body = lastInit().body;
  expect(typeof body, '본문이 글자로 나가야 한다').toBe('string');
  return JSON.parse(body as string) as Record<string, unknown>;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(ok(payment()));
});

describe('어떻게 부르는가', () => {
  it('시크릿 키를 Basic auth 의 **아이디 자리**에 넣는다 — 비밀번호는 빈 값이다', async () => {
    await gateway().confirm({ paymentKey: 'pk_1', orderNo: '20260903-0000001', amount: won(289_000) });

    const expected = `Basic ${Buffer.from(`${KEY}:`).toString('base64')}`;
    expect(lastInit().headers['Authorization']).toBe(expected);
  });

  it('승인은 우리 주문번호를 orderId 로 보낸다 — 토스가 그것으로 중복 승인을 막는다', async () => {
    await gateway().confirm({ paymentKey: 'pk_1', orderNo: '20260903-0000001', amount: won(289_000) });

    expect(String(lastCall()[0])).toContain('/payments/confirm');
    expect(sentBody()).toEqual({
      paymentKey: 'pk_1', orderId: '20260903-0000001', amount: 289_000,
    });
  });

  it('조회는 GET 이고 본문이 없다 — 열쇠는 주소에 넣되 인코딩한다', async () => {
    await gateway().inquire('pk/1 2');

    expect(lastInit().method).toBe('GET');
    expect(lastInit().body).toBeUndefined();
    expect(String(lastCall()[0])).toContain(encodeURIComponent('pk/1 2'));
  });

  it('취소는 **멱등키를 붙인다** — 다시 보내도 두 번 환불되지 않는다', async () => {
    /*
     * 그물망이 끊겨 요청이 나갔는지 모를 때 호출부는 재시도한다. 그때 같은 열쇠가 없으면
     * 토스는 두 번째도 새 취소로 받는다 — 돈이 두 번 나간다.
     */
    await gateway().cancel({
      paymentKey: 'pk_1', amount: won(10_000), reason: '부분 취소', idempotencyKey: 'cancel-1',
    });

    expect(lastInit().headers['Idempotency-Key']).toBe('cancel-1');
    expect(sentBody()).toEqual({ cancelReason: '부분 취소', cancelAmount: 10_000 });
  });

  it('금액이 없는 취소는 **전액 취소**다 — 0원을 보내지 않는다', async () => {
    // cancelAmount 를 0 으로 보내면 토스는 "0원만 취소" 로 읽는다
    await gateway().cancel({
      paymentKey: 'pk_1', amount: null, reason: '전액 취소', idempotencyKey: 'cancel-2',
    });

    expect(sentBody()).toEqual({ cancelReason: '전액 취소' });
    expect(sentBody()).not.toHaveProperty('cancelAmount');
  });

  it('승인에는 멱등키를 안 붙인다 — 그 자리는 orderId 가 맡는다', async () => {
    await gateway().confirm({ paymentKey: 'pk_1', orderNo: '20260903-0000001', amount: won(1_000) });

    expect(lastInit().headers['Idempotency-Key']).toBeUndefined();
  });
});

describe('실패를 어떻게 읽는가', () => {
  it('연결 자체가 안 되면 **재시도할 만한 것**으로 표시한다', async () => {
    // 요청이 나갔는지 알 수 없다 — 그래서 호출부는 멱등키를 붙여 다시 보낸다
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));

    await expect(gateway().inquire('pk_1')).rejects.toMatchObject({
      code: 'NETWORK_ERROR', retryable: true,
    });
  });

  it('5xx 는 재시도할 만하다', async () => {
    fetchMock.mockResolvedValue(fail(503, { code: 'SERVICE_UNAVAILABLE', message: '점검 중' }));

    await expect(gateway().inquire('pk_1')).rejects.toMatchObject({ retryable: true });
  });

  it.each(['FAILED_INTERNAL_SYSTEM_PROCESSING', 'PROVIDER_ERROR'])(
    '%s 는 4xx 여도 재시도할 만하다',
    async (code) => {
      fetchMock.mockResolvedValue(fail(400, { code, message: '일시 장애' }));
      await expect(gateway().inquire('pk_1')).rejects.toMatchObject({ code, retryable: true });
    },
  );

  it('그 밖의 4xx 는 다시 보내도 같은 답이다 — 재시도하지 않는다', async () => {
    /*
     * 잘못된 금액이나 이미 취소된 결제를 되풀이해 보내면, 로그만 쌓이고 사람은
     * "처리 중" 화면에 더 오래 묶인다.
     */
    fetchMock.mockResolvedValue(fail(400, { code: 'INVALID_REQUEST', message: '잘못된 요청' }));

    await expect(gateway().inquire('pk_1')).rejects.toMatchObject({
      code: 'INVALID_REQUEST', retryable: false,
    });
  });

  it('토스가 코드를 안 주면 HTTP 상태로 적는다 — 무엇이 터졌는지는 남아야 한다', async () => {
    fetchMock.mockResolvedValue(fail(502, null));

    const error = await gateway().inquire('pk_1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaymentError);
    expect((error as PaymentError).code).toBe('HTTP_502');
  });

  it('본문이 JSON 이 아니어도 무너지지 않는다', async () => {
    fetchMock.mockResolvedValue({
      ok: false, status: 500, json: async () => { throw new Error('not json'); },
    });

    await expect(gateway().inquire('pk_1')).rejects.toBeInstanceOf(PaymentError);
  });
});

describe('응답을 어떻게 옮기는가', () => {
  it('한글 수단 이름을 우리 코드로 좁힌다', async () => {
    for (const [korean, code] of [
      ['카드', 'CARD'], ['가상계좌', 'VIRTUAL_ACCOUNT'], ['계좌이체', 'TRANSFER'],
      ['간편결제', 'EASY_PAY'],
    ] as const) {
      fetchMock.mockResolvedValue(ok(payment({ method: korean })));
      expect((await gateway().inquire('pk_1')).method).toBe(code);
    }
  });

  it('수단을 모르면 카드로 둔다 — 비워 두면 화면이 그릴 것이 없다', async () => {
    fetchMock.mockResolvedValue(ok(payment({ method: '새로운결제수단' })));
    expect((await gateway().inquire('pk_1')).method).toBe('CARD');

    fetchMock.mockResolvedValue(ok(payment({ method: undefined })));
    expect((await gateway().inquire('pk_1')).method).toBe('CARD');
  });

  it('**모르는 상태는 실패로 읽는다** — 성공 쪽으로 기울면 안 된다', async () => {
    /*
     * 토스가 새 상태를 추가했을 때 그것을 그대로 통과시키면, 아직 승인되지 않은 결제가
     * 우리 쪽에서 완료로 보일 수 있다. 모르는 것은 닫는 쪽으로 읽는다.
     */
    fetchMock.mockResolvedValue(ok(payment({ status: 'SOMETHING_NEW' })));

    expect((await gateway().inquire('pk_1')).status).toBe('FAILED');
  });

  it('아는 상태는 그대로 옮긴다', async () => {
    fetchMock.mockResolvedValue(ok(payment({ status: 'WAITING_FOR_DEPOSIT' })));
    expect((await gateway().inquire('pk_1')).status).toBe('WAITING_FOR_DEPOSIT');
  });

  it('승인 시각과 승인번호를 들고 온다 — 대사와 영수증이 쓴다', async () => {
    const result = await gateway().inquire('pk_1');

    expect(result.approvalNo).toBe('00012345');
    expect(result.approvedAt).toEqual(new Date('2026-09-03T04:05:06+09:00'));
    expect(result.amount).toBe(289_000);
  });

  it('아직 승인 전이면 시각도 번호도 비운다', async () => {
    fetchMock.mockResolvedValue(ok(payment({ approvedAt: null, card: null, status: 'READY' })));

    const result = await gateway().inquire('pk_1');
    expect(result.approvedAt).toBeNull();
    expect(result.approvalNo).toBeNull();
  });

  it('가상계좌는 입금할 곳과 기한을 그대로 옮긴다', async () => {
    fetchMock.mockResolvedValue(ok(payment({
      method: '가상계좌',
      virtualAccount: { bank: '국민', accountNumber: '12345678901234', dueDate: '2026-09-05T23:59:59+09:00' },
    })));

    expect((await gateway().inquire('pk_1')).virtualAccount).toEqual({
      bank: '국민', accountNumber: '12345678901234',
      dueDate: new Date('2026-09-05T23:59:59+09:00'),
    });
  });

  it('은행 이름이 없으면 코드라도 남긴다 — 어디에 넣을지는 말해야 한다', async () => {
    fetchMock.mockResolvedValue(ok(payment({
      virtualAccount: { bankCode: '04', accountNumber: '12345678901234' },
    })));

    expect((await gateway().inquire('pk_1')).virtualAccount).toMatchObject({ bank: '04' });
  });

  it('PG 응답 원문을 들고 나온다 — 대사와 장애 분석이 그것으로 본다', async () => {
    const result = await gateway().inquire('pk_1');
    expect(result.raw).toMatchObject({ paymentKey: 'pk_1', totalAmount: 289_000 });
  });
});
