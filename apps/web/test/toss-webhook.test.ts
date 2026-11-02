import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 토스 웹훅 창구.
 *
 * **본문을 믿지 않는다** — 이 주소는 공개돼 있어 누구나 아무 내용이나 보낼 수 있다. 꺼내는 것은 paymentKey 하나뿐이고
 * 그것도 "가서 확인해라" 는 지시로만 쓴다. 그리고 **반영된 입금은 감사 로그에 남는다**: 그 순간 주문이 결제완료가
 * 되는데, 남기지 않으면 "이 주문이 왜 결제완료가 됐나" 에 답할 자리가 감사 로그에 없다(한동안 그랬다).
 */

const applyDeposit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/payments/deposit', () => ({ applyDeposit }));
const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', async () => ({
  recordAudit,
  WEBHOOK_ACTOR: { id: 'system:webhook:toss', role: 'SUPER_ADMIN', merchantId: null },
}));

const { POST } = await import('~/app/api/webhooks/toss/route');

const send = (body: unknown) =>
  POST(new Request('http://localhost/api/webhooks/toss', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  vi.clearAllMocks();
  applyDeposit.mockResolvedValue({ applied: true, orderNo: '20260921-0000001', status: 'PAID' });
});

/**
 * **길이를 보는 까닭.**
 *
 * 이 주소는 서명 검증이 없다 — 본문을 안 믿고 PG 에 다시 묻는 설계라 필요가 없고, 그래서
 * **누구나 부를 수 있다.** 그 사실이 요청 제한 면제의 근거에는 "서명 검증이 막는다" 로
 * 거꾸로 적혀 있었다. 아무나 부를 수 있으면 본문의 글자 하나가 그대로 DB 조회로 들어가므로,
 * 조회 앞에서 길이를 끊는다. 실제 키는 가장 긴 것이 서른여섯 자다.
 */
describe('받아 줄 paymentKey', () => {
  it('너무 길면 DB 를 치지 않는다', async () => {
    const response = await send({ data: { paymentKey: 'x'.repeat(201) } });

    expect(applyDeposit).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ reason: 'paymentKey 가 너무 깁니다' });
  });

  it('상한까지는 받는다 — 정상 키를 거절하면 입금을 놓친다', async () => {
    await send({ data: { paymentKey: 'x'.repeat(200) } });

    expect(applyDeposit).toHaveBeenCalledWith('x'.repeat(200));
  });

  it('실제 키 길이는 상한에 한참 못 미친다', async () => {
    // 가장 긴 실물이 서른여섯 자다. 상한이 그 근처로 내려오면 정상 키가 막힌다
    await send({ data: { paymentKey: 'mock_va_20260910-7063897' } });

    expect(applyDeposit).toHaveBeenCalledWith('mock_va_20260910-7063897');
  });

  it('길이로 끊어도 200 이다 — 재시도해도 결과가 같다', async () => {
    const response = await send({ data: { paymentKey: 'x'.repeat(5_000) } });

    expect(response.status).toBe(200);
  });
});

describe('입금이 반영되면', () => {
  it('누가·무엇을 했는지 감사 로그에 남는다 — 사람이 아니라 웹훅이다', async () => {
    await send({ eventType: 'PAYMENT_STATUS_CHANGED', data: { paymentKey: 'pk_1' } });

    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({
      actor: expect.objectContaining({ id: 'system:webhook:toss' }),
      action: 'payment.deposit',
      targetType: 'order',
      targetId: '20260921-0000001',
      after: { status: 'PAID' },
    }));
  });

  it('반영되지 않은 신호는 남기지 않는다 — 이미 반영·입금 전은 아무 일도 없던 것이다', async () => {
    applyDeposit.mockResolvedValue({ applied: false, reason: '이미 반영된 입금입니다' });

    const response = await send({ data: { paymentKey: 'pk_1' } });

    expect(response.status).toBe(200);
    expect(recordAudit).not.toHaveBeenCalled();
  });
});

describe('본문을 믿지 않는다', () => {
  it('paymentKey 가 없으면 아무것도 하지 않고 200 으로 답한다 — 4xx 는 재시도를 부른다', async () => {
    const response = await send({ eventType: 'PAYMENT_STATUS_CHANGED', data: { status: 'DONE' } });

    expect(response.status).toBe(200);
    expect(applyDeposit).not.toHaveBeenCalled();
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('본문의 상태는 보지 않는다 — 상태와 금액은 결제사에 직접 묻는다', async () => {
    await send({ data: { paymentKey: 'pk_1', status: 'DONE', amount: 99_999_999 } });

    // 창구가 결제사에 넘기는 것은 열쇠 하나뿐이다
    expect(applyDeposit).toHaveBeenCalledWith('pk_1');
  });

  it('우리 쪽이 터지면 500 으로 답한다 — 그때는 다시 보내 주는 편이 맞다', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    applyDeposit.mockRejectedValue(new Error('DB 가 죽었다'));

    expect((await send({ data: { paymentKey: 'pk_1' } })).status).toBe(500);
    expect(quiet).toHaveBeenCalled();
    quiet.mockRestore();
  });
});
