import { describe, it, expect } from 'vitest';
import { isUsableSecretKey } from '~/lib/payments';
import { createMockGateway } from '~/lib/payments/mock';

describe('시크릿 키 형식 검증', () => {
  it.each([
    ['테스트 키', 'test_sk_abcdefghijklmnopqrstuvwxyz01'],
    ['라이브 키', 'live_sk_abcdefghijklmnopqrstuvwxyz01'],
  ])('%s 는 실제 PG 로 인정한다', (_l, key) => {
    expect(isUsableSecretKey(key)).toBe(true);
  });

  it.each([
    ['비어 있음', ''],
    ['undefined', undefined],
    ['플레이스홀더', 'test_sk_여기에'],
    ['접두사만', 'test_sk_'],
    ['너무 짧음', 'test_sk_abc'],
    ['접두사 없음', 'abcdefghijklmnopqrstuvwxyz01'],
    ['클라이언트 키', 'test_ck_abcdefghijklmnopqrstuvwxyz01'],
  ])('%s 는 Mock 으로 떨어뜨린다', (_l, key) => {
    // .env.example 을 복사해 만든 플레이스홀더를 진짜 키로 취급하면
    // Mock 으로 도는 줄 알고 개발하다 실제 API 를 두드린다
    expect(isUsableSecretKey(key)).toBe(false);
  });
});

describe('Mock 게이트웨이', () => {
  const gw = createMockGateway();

  it('카드 결제는 즉시 DONE 이다', async () => {
    const r = await gw.confirm({ paymentKey: 'mock_1', orderNo: '20260831-1234567', amount: 289_000 as never });
    expect(r.status).toBe('DONE');
    expect(r.method).toBe('CARD');
    expect(r.approvedAt).toBeInstanceOf(Date);
  });

  it('가상계좌는 입금 대기이고 계좌를 준다', async () => {
    const r = await gw.confirm({ paymentKey: 'mock_va_1', orderNo: '20260831-1234567', amount: 289_000 as never });
    expect(r.status).toBe('WAITING_FOR_DEPOSIT');
    expect(r.virtualAccount?.accountNumber).toBeTruthy();
    expect(r.approvedAt).toBeNull();
  });

  it('실패 시나리오를 재현한다 — 실패 경로도 테스트해야 한다', async () => {
    await expect(
      gw.confirm({ paymentKey: 'mock_fail_1', orderNo: 'o', amount: 1 as never }),
    ).rejects.toMatchObject({ code: 'REJECT_CARD_COMPANY', retryable: false });
  });

  it('네트워크 오류는 재시도 가능으로 표시한다', async () => {
    await expect(
      gw.confirm({ paymentKey: 'mock_timeout_1', orderNo: 'o', amount: 1 as never }),
    ).rejects.toMatchObject({ code: 'NETWORK_ERROR', retryable: true });
  });

  it('전액 취소는 CANCELED, 부분 취소는 PARTIAL_CANCELED 다', async () => {
    const full = await gw.cancel({ paymentKey: 'pk', amount: null, reason: 'r', idempotencyKey: 'k' });
    expect(full.status).toBe('CANCELED');
    const partial = await gw.cancel({ paymentKey: 'pk', amount: 1000 as never, reason: 'r', idempotencyKey: 'k' });
    expect(partial.status).toBe('PARTIAL_CANCELED');
  });
});
