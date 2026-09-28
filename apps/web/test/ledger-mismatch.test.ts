import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 돈은 움직였는데 장부가 어긋난 자리.
 *
 * **"수동 대사 필요" 라고 적어 두고 그 대사를 할 길이 없었다.** PG 왕복은 성공했는데 그 뒤 DB 반영이
 * 실패하는 자리가 다섯인데(승인·취소·부분취소·반품·환불), 전부 `console.error` 한 줄로 끝났다. 손님
 * 카드에서는 돈이 빠졌거나 나갔는데 우리 기록에는 없고, 손님은 문의를 넣고 운영자는 로그를 뒤진다.
 * 포인트에는 대사 배치와 화면이 있는데 결제·환불에는 없었다.
 */

const captured = vi.hoisted(() => [] as { severity: string; routePath: string; path: string; message: string }[]);

const { reportLedgerMismatch } = await import('~/lib/errors/ledger');
const { setErrorSinksForTest } = await import('~/lib/errors');

beforeEach(() => {
  captured.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  setErrorSinksForTest([{
    name: 'spy',
    report: (report: { severity: string; routePath: string; path: string; message: string }) => {
      captured.push(report);
      return Promise.resolve();
    },
  }]);
});
afterEach(() => {
  setErrorSinksForTest(null);
  vi.restoreAllMocks();
});

describe('알리는 방식', () => {
  it('화면이 깨진 것과 같은 급으로 본다', async () => {
    await reportLedgerMismatch({ stage: 'order.refund', orderNo: '20260915-1234567', error: new Error('DB 다운') });

    expect(captured[0]!.severity).toBe('fatal');
  });

  it('걸음마다 한 묶음이 된다 — 주문마다 다른 오류로 흩어지면 목록이 쓸모없다', async () => {
    await reportLedgerMismatch({ stage: 'order.cancel', orderNo: '20260915-1111111', error: new Error('x') });
    await reportLedgerMismatch({ stage: 'order.cancel', orderNo: '20260915-2222222', error: new Error('x') });

    expect(captured.map((c) => c.routePath)).toEqual(['ledger:order.cancel', 'ledger:order.cancel']);
  });

  it('운영자가 곧바로 열어 볼 자리를 적는다', async () => {
    await reportLedgerMismatch({ stage: 'return.complete', orderNo: '20260915-1234567', error: new Error('x') });

    expect(captured[0]!.path).toBe('/admin/orders/20260915-1234567');
  });

  it('무엇이 어긋났는지 한 줄로 말한다', async () => {
    await reportLedgerMismatch({
      stage: 'payment.confirm', orderNo: '20260915-1234567', error: new Error('연결 끊김'),
    });

    expect(captured[0]!.message).toContain('장부가 어긋났다');
    expect(captured[0]!.message, '원래 까닭이 사라지면 무엇을 고쳐야 할지 모른다').toContain('연결 끊김');
  });

  it('대사에 필요한 값은 로그에 남긴다 — "다시 눌러도 되는가" 를 그 값으로 판단한다', async () => {
    await reportLedgerMismatch({
      stage: 'order.cancelItems',
      orderNo: '20260915-1234567',
      detail: { idempotencyKey: 'cancel:items:abc' },
      error: new Error('x'),
    });

    const line = vi.mocked(console.error).mock.calls.find((c) => String(c[0]).includes('장부 어긋남'));
    expect(line).toBeTruthy();
    expect(JSON.stringify(line![1])).toContain('cancel:items:abc');
  });

  /**
   * **보고하다 또 던지면 원래 오류가 묻힌다.** 부르는 자리는 이미 원래 오류를 던지는 중이다.
   */
  it('보고가 실패해도 던지지 않는다', async () => {
    setErrorSinksForTest([{ name: 'broken', report: () => Promise.reject(new Error('싱크 고장')) }]);

    await expect(
      reportLedgerMismatch({ stage: 'order.refund', orderNo: '20260915-1234567', error: new Error('x') }),
    ).resolves.toBeUndefined();
  });
});

/**
 * 조용히 삼키는 자리가 다시 생기지 않게 지킨다.
 *
 * 다섯 자리는 전부 "PG 는 끝났는데 DB 가 실패했다" 를 스스로 알아보고 있었다(`pgDone` 같은 표시).
 * 그 자리에서 로그만 남기면 아무에게도 닿지 않는다.
 */
const SRC = join(process.cwd(), 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

describe('대사가 필요한 자리', () => {
  it('"수동 대사" 를 말하는 곳은 전부 보고한다', () => {
    const offenders = walk(SRC)
      .map((path) => ({ rel: path.slice(SRC.length + 1), source: readFileSync(path, 'utf8') }))
      .filter((f) => f.rel !== join('lib', 'errors', 'ledger.ts'))
      .filter((f) => f.source.includes('수동 대사'))
      .filter((f) => !f.source.includes('reportLedgerMismatch'))
      .map((f) => f.rel);

    expect(
      offenders,
      `대사가 필요하다고 적어 두고 아무에게도 알리지 않는다:\n${offenders.join('\n')}\n` +
        'lib/errors/ledger 의 reportLedgerMismatch 를 쓰면 운영 화면과 메일로 닿는다.',
    ).toEqual([]);
  });
});
