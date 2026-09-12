import { describe, it, expect, afterEach } from 'vitest';
import { getPaymentGateway, isUsableSecretKey, setPaymentGateway } from '~/lib/payments';
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

/**
 * 검사용 Mock 스위치.
 *
 * 결제 승인 뒤(결제완료 · 재고 확정 · 안내)가 화면 검사를 한 번도 지나가지
 * 못하고 있었다. E2E 는 `next start` 로 도는 **프로덕션 빌드**인데, 게이트웨이
 * 고르기가 그것을 **운영 배포**와 같은 것으로 보고 키를 요구했기 때문이다.
 *
 * 그 둘을 갈랐고, 대신 스위치가 운영으로 새면 결제 없이 주문이 확정된다.
 * 그래서 새지 않는다는 것을 여기서 지킨다 — 로그인 요청 제한을 E2E 에서만
 * 끄면서 "기본이 켜짐" 을 단위 검사로 지킨 것과 같은 방식이다.
 */
describe('Mock 스위치가 운영으로 새지 않는다', () => {
  const KEEP = { ...process.env };
  afterEach(() => {
    process.env = { ...KEEP };
    setPaymentGateway(null);
  });

  function env(patch: Record<string, string | undefined>): void {
    setPaymentGateway(null);
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  it('운영 배포에서 켜면 던진다', () => {
    // 여기가 이 검사의 전부다. 조용히 Mock 으로 도는 순간 결제 없이 주문이 확정된다.
    env({ PAYMENT_GATEWAY: 'mock', VERCEL_ENV: 'production', TOSS_SECRET_KEY: '' });
    expect(() => getPaymentGateway()).toThrow(/운영 배포에서 쓸 수 없습니다/);
  });

  it('진짜 키가 있는데 켜도 던진다', () => {
    // 실수로 켜 뒀거나 실수로 진짜 키를 넣었거나 — 어느 쪽이든 알려야 한다
    env({
      PAYMENT_GATEWAY: 'mock',
      VERCEL_ENV: undefined,
      TOSS_SECRET_KEY: 'test_sk_abcdefghijklmnopqrstuvwxyz',
    });
    expect(() => getPaymentGateway()).toThrow(/둘 중 하나가 잘못됐습니다/);
  });

  it('미리보기 배포에서는 쓸 수 있다', () => {
    env({ PAYMENT_GATEWAY: 'mock', VERCEL_ENV: 'preview', TOSS_SECRET_KEY: '' });
    expect(getPaymentGateway().provider).toBe('mock');
  });

  it('프로덕션 빌드라도 배포가 아니면 쓸 수 있다 — E2E 가 여기 있다', () => {
    env({ PAYMENT_GATEWAY: 'mock', NODE_ENV: 'production', VERCEL_ENV: undefined, TOSS_SECRET_KEY: '' });
    expect(getPaymentGateway().provider).toBe('mock');
  });

  /**
   * **데모 배포.**
   *
   * 이 저장소는 포트폴리오라 사업자번호가 없고, 그러니 실제 PG 계약도 없다.
   * 그렇다고 배포에서 결제를 막아 두면 주문 흐름을 아무도 끝까지 볼 수 없다.
   * 그래서 "돈이 오가지 않는 데모" 라고 **대놓고 선언**하면 운영 배포에서도
   * Mock 을 쓴다. 스위치를 둘로 나눠 실수로 켜지는 일이 없게 한다.
   */
  it('데모라고 선언하면 운영 배포에서도 Mock 을 쓴다', () => {
    env({
      PAYMENT_GATEWAY: 'mock',
      DEMO_PAYMENT: '1',
      VERCEL_ENV: 'production',
      TOSS_SECRET_KEY: '',
    });
    expect(getPaymentGateway().provider).toBe('mock');
  });

  it('데모 선언만 있고 요구가 없으면 아무것도 열리지 않는다', () => {
    // 스위치 하나만으로 열리면 둘로 나눈 뜻이 없다
    env({
      PAYMENT_GATEWAY: undefined,
      DEMO_PAYMENT: '1',
      NODE_ENV: 'production',
      TOSS_SECRET_KEY: '',
    });
    expect(() => getPaymentGateway()).toThrow(/TOSS_SECRET_KEY/);
  });

  it('데모라도 진짜 키가 있으면 던진다', () => {
    env({
      PAYMENT_GATEWAY: 'mock',
      DEMO_PAYMENT: '1',
      VERCEL_ENV: 'production',
      TOSS_SECRET_KEY: 'live_sk_abcdefghijklmnopqrstuvwxyz',
    });
    expect(() => getPaymentGateway()).toThrow(/둘 중 하나가 잘못됐습니다/);
  });

  it('켜지 않으면 프로덕션 빌드는 여전히 던진다', () => {
    // 스위치를 더했다고 기본이 느슨해지면 안 된다
    env({ PAYMENT_GATEWAY: undefined, NODE_ENV: 'production', TOSS_SECRET_KEY: '' });
    expect(() => getPaymentGateway()).toThrow(/TOSS_SECRET_KEY/);
  });

  it('저장소에 커밋된 설정 중 이 스위치를 켜는 것이 없다', async () => {
    /*
     * 사람이 실수로 켜는 것보다 **설정 파일에 적혀 들어가는 것**이 무섭다.
     * 한 번 적히면 아무도 다시 안 본다. E2E 서버 설정에만 있어야 한다.
     */
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(process.cwd(), '..', '..');
    const files = [
      join(process.cwd(), '.env.example'),
      join(root, 'vercel.json'),
      join(root, '.github', 'workflows', 'ci.yml'),
      join(root, 'tooling', 'ci-local.sh'),
    ].filter((f) => existsSync(f));

    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text, file).not.toContain('PAYMENT_GATEWAY');
      expect(text, file).not.toContain('DEMO_PAYMENT');
    }
  });
});

/**
 * **결제 방식은 서버가 한 번 정하고 끝이다.**
 *
 * 예전에는 브라우저가 클라이언트 키를, 서버가 시크릿 키를 각자 보고 정했다.
 * 배포에 두 키가 다 없자 브라우저는 "Mock 으로 간다" 며 주문을 만들었고
 * 서버는 "프로덕션에서 Mock 은 못 쓴다" 며 던졌다 — **주문만 만들어지고
 * 확정이 500** 이 났다(20260910-7063897 이 입금대기로 남았다). 확정 창구는
 * 없는 주문번호에도 500 을 냈다. 주문을 찾기도 전에 터진 것이다.
 *
 * 갈림을 없앤 방식은 하나다. 브라우저에서 판단을 걷어내는 것. 그러니 여기서
 * 지키는 것은 **브라우저 코드가 키를 보고 방식을 정하지 않는다**는 것이다.
 * 값을 읽는 것(결제창에 넘길 키)과 방식을 정하는 것은 다르다.
 */
describe('결제 방식을 정하는 자리는 하나다', () => {
  const browserFiles = ['src/components/checkout-form.tsx', 'src/lib/checkout/place-order.ts'];

  it.each(browserFiles)('%s 가 키로 방식을 가르지 않는다', async (file) => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const text = readFileSync(join(process.cwd(), file), 'utf8');
    expect(text).not.toContain('isUsableClientKey');
  });

  it('결제 화면이 서버 결론을 계산해 폼에 내려 준다', async () => {
    const { readFileSync } = await import('node:fs');
    const { appFile } = await import('./app-routes');
    const page = readFileSync(appFile('/checkout'), 'utf8');
    expect(page).toContain('serverPaymentMode');
    expect(page).toContain('paymentMode={');
  });
});
