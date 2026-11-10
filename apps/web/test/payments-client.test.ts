// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PAYMENT_METHOD_CODE } from '@shop/core';
import { canOpenWindow } from '~/lib/payments/methods';
import type { OpenPaymentInput } from '~/lib/payments/client';

/**
 * 토스 결제창을 불러오고 여는 자리.
 *
 * **돈 길의 마지막 한 걸음인데 문장 26개 중 22개가 안 돌고 있었다.** 부르는 쪽
 * (`pay-order.ts`)의 검사는 이 모듈을 통째로 흉내 내므로, 여기서 안 보면
 * 아무 데서도 안 본다.
 *
 * 외부 스크립트라 막힐 수 있다. 막혔을 때 **다시 시도할 수 있는지**가 핵심이다 —
 * 실패한 약속을 들고 있으면 새로 고치기 전까지 결제를 못 한다. 그리고 넘기는
 * 설정은 수단마다 다른데, 그 차이를 아무도 지키지 않고 있었다.
 */

const SRC = 'https://js.tosspayments.com/v2/standard';

const load = async () => {
  vi.resetModules();
  return await import('~/lib/payments/client');
};

const tags = () => [...document.head.querySelectorAll('script')];
const settle = (kind: 'load' | 'error', index = 0) =>
  tags()[index]!.dispatchEvent(new Event(kind));

const INPUT: OpenPaymentInput = {
  clientKey: 'test_ck_abcdefghijklmnopqrstuvwx',
  customerKey: 'anon_abcdefgh',
  orderNo: '20260914-0000001',
  orderName: '울 코트 외 1건',
  amount: 128_000,
  method: 'CARD',
  origin: 'https://plain-shop-byjang.vercel.app',
};

/** 토스가 내놓는 전역 흉내. 받은 열쇠와 설정을 남긴다 */
function fakeSdk(requestPayment = vi.fn<(o: Record<string, unknown>) => Promise<void>>()) {
  const seen: { clientKey?: string; customerKey?: string } = {};
  window.TossPayments = (clientKey: string) => {
    seen.clientKey = clientKey;
    return {
      payment: ({ customerKey }: { customerKey: string }) => {
        seen.customerKey = customerKey;
        return { requestPayment };
      },
    };
  };
  return { seen, requestPayment };
}

/** 결제창에 간 설정 */
const asked = (requestPayment: { mock: { calls: unknown[][] } }) =>
  requestPayment.mock.calls[0]![0] as Record<string, unknown>;

beforeEach(() => {
  document.head.replaceChildren();
  delete window.TossPayments;
});

describe('쓸 수 있는 클라이언트 열쇠', () => {
  it.each([
    ['test_ck_abcdefghijklmnopqrstuvwx', '테스트 열쇠'],
    ['live_ck_abcdefghijklmnopqrstuvwx', '운영 열쇠'],
    ['test_gck_abcdefghijklmnopqrstuvwx', '위젯 열쇠'],
  ])('%s — %s 는 쓸 수 있다', async (key: string | undefined, _why: string) => {
    const { isUsableClientKey } = await load();
    expect(isUsableClientKey(key)).toBe(true);
  });

  it.each([
    [undefined, '아예 없다'],
    ['', '빈 글자'],
    ['your-client-key-here', '.env.example 의 자리표'],
    ['test_ck_short', '뒤가 너무 짧다'],
    ['test_sk_abcdefghijklmnopqrstuvwx', '시크릿 열쇠 — 화면에 내려가면 안 된다'],
    ['prod_ck_abcdefghijklmnopqrstuvwx', '없는 머리말'],
    ['test_ck_abcdefghijklmnopqrstu-wx', '열쇠에 없는 글자'],
  ])('%s — %s 는 못 쓴다', async (key: string | undefined, _why: string) => {
    const { isUsableClientKey } = await load();
    expect(isUsableClientKey(key)).toBe(false);
  });

  it('앞뒤 공백은 따진 뒤에 본다 — 환경값을 붙여 넣으면 줄바꿈이 따라온다', async () => {
    const { isUsableClientKey } = await load();
    expect(isUsableClientKey('  test_ck_abcdefghijklmnopqrstuvwx\n')).toBe(true);
  });
});

describe('스크립트를 붙이는 규칙', () => {
  it('처음 열면 비동기 script 하나를 붙인다 — 첫 화면부터 들고 다니지 않는다', async () => {
    const { openPaymentWindow } = await load();
    void openPaymentWindow(INPUT).catch(() => {});

    expect(tags()).toHaveLength(1);
    expect(tags()[0]!.src).toBe(SRC);
    expect(tags()[0]!.async).toBe(true);
  });

  it('이미 불러와 있으면 아무것도 붙이지 않는다', async () => {
    fakeSdk();
    const { openPaymentWindow } = await load();
    await openPaymentWindow(INPUT);

    expect(tags()).toHaveLength(0);
  });

  it('두 번 눌러도 script 는 하나다 — 둘이면 하나는 영원히 대기한다', async () => {
    const { openPaymentWindow } = await load();
    const first = openPaymentWindow(INPUT);
    const second = openPaymentWindow(INPUT);

    expect(tags()).toHaveLength(1);

    fakeSdk();
    settle('load');
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });
});

describe('못 불러왔을 때', () => {
  it('까닭을 들고 거절한다', async () => {
    const { openPaymentWindow } = await load();
    const opening = openPaymentWindow(INPUT);
    settle('error');

    await expect(opening).rejects.toThrow('결제 모듈을 불러오지 못했습니다.');
  });

  it('다시 누르면 다시 붙인다 — 한 번 막혔다고 결제를 못 하면 안 된다', async () => {
    const { openPaymentWindow } = await load();
    const first = openPaymentWindow(INPUT);
    settle('error');
    await expect(first).rejects.toThrow();

    const second = openPaymentWindow(INPUT);
    expect(tags(), '두 번째 시도가 새 script 를 붙이지 않았다').toHaveLength(2);

    const { requestPayment } = fakeSdk();
    settle('load', 1);
    await second;
    expect(requestPayment).toHaveBeenCalledTimes(1);
  });

  it('스크립트는 왔는데 전역이 없으면 같은 말로 거절한다', async () => {
    const { openPaymentWindow } = await load();
    const opening = openPaymentWindow(INPUT);
    settle('load');

    await expect(opening).rejects.toThrow('결제 모듈을 불러오지 못했습니다.');
  });
});

describe('결제창에 넘기는 것', () => {
  const open = async (over: Partial<OpenPaymentInput> = {}) => {
    const sdk = fakeSdk();
    const { openPaymentWindow } = await load();
    await openPaymentWindow({ ...INPUT, ...over });
    return sdk;
  };

  it('열쇠는 전역에, 손님 열쇠는 결제에 — 회원 id 는 어디에도 안 간다', async () => {
    const { seen } = await open();

    expect(seen.clientKey).toBe(INPUT.clientKey);
    expect(seen.customerKey).toBe('anon_abcdefgh');
  });

  it('주문번호가 그대로 토스의 주문 id 가 된다 — 두 번 승인을 토스도 막는다', async () => {
    const { requestPayment } = await open();

    expect(asked(requestPayment)).toMatchObject({
      orderId: '20260914-0000001',
      orderName: '울 코트 외 1건',
      amount: { currency: 'KRW', value: 128_000 },
      method: 'CARD',
    });
  });

  it('돌아올 주소는 받은 출처로 짓는다 — 다른 데서 열어도 우리 화면으로 온다', async () => {
    const { requestPayment } = await open({ origin: 'http://localhost:3100' });

    expect(asked(requestPayment)).toMatchObject({
      successUrl: 'http://localhost:3100/checkout/success',
      failUrl: 'http://localhost:3100/checkout/fail',
    });
  });

  it('카드면 카드 설정만, 가상계좌면 가상계좌 설정만 붙는다', async () => {
    const card = await open({ method: 'CARD' });
    expect(asked(card.requestPayment)).toMatchObject({
      card: { useEscrow: false, flowMode: 'DEFAULT' },
    });
    expect(asked(card.requestPayment)).not.toHaveProperty('virtualAccount');

    const va = await open({ method: 'VIRTUAL_ACCOUNT' });
    expect(asked(va.requestPayment)).toMatchObject({
      virtualAccount: { cashReceipt: { type: '소득공제' }, useEscrow: false },
    });
    expect(asked(va.requestPayment)).not.toHaveProperty('card');
  });

  it.each(PAYMENT_METHOD_CODE.filter(canOpenWindow).filter((m) => m !== 'CARD' && m !== 'VIRTUAL_ACCOUNT'))(
    '%s 는 수단별 설정 없이 그대로 넘긴다',
    async (method) => {
      /*
       * 수단 목록이 늘면 여기서 함께 늘어난다 — 손으로 적은 셋만 보면 새 수단은
       * 아무 검사도 없이 돈 길에 들어온다.
       */
      const { requestPayment } = await open({ method });
      const options = asked(requestPayment);

      expect(options.method).toBe(method);
      expect(options).not.toHaveProperty('card');
      expect(options).not.toHaveProperty('virtualAccount');
    },
  );

  it('결제창이 거절하면 그 거절을 그대로 올려 보낸다 — 부르는 쪽이 판단한다', async () => {
    fakeSdk(vi.fn().mockRejectedValue(new Error('사용자가 창을 닫았습니다')));
    const { openPaymentWindow } = await load();

    await expect(openPaymentWindow(INPUT)).rejects.toThrow('사용자가 창을 닫았습니다');
  });
});
