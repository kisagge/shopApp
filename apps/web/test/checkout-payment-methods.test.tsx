// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { PAYMENT_METHOD_CODE } from '@shop/core';
import type { PaymentMethodInput } from '@shop/contract';
import { PaymentMethods } from '~/components/checkout/payment-methods';
import {
  WINDOW_UNSUPPORTED_METHOD, canOpenWindow, offeredMethods, DEFAULT_PAYMENT_METHOD,
} from '~/lib/payments/methods';

/**
 * 결제 수단 고르개.
 *
 * **목록이 아니라 라디오 묶음이다.** 그런데 버튼을 나열해 두었을 뿐이라 두 가지가 없었다 —
 * 화살표로 옮겨 다닐 수 없었고, 수단 넷이 전부 탭 순서에 있었다. **axe 로는 안 잡힌다**:
 * 마크업은 완벽하고 없는 것은 동작인데, 정지한 화면에는 동작이 찍히지 않는다. 그래서
 * 여기서 누르고 옮겨 본다.
 */

const open = (over: Partial<Parameters<typeof PaymentMethods>[0]> = {}) => {
  const onSelect = vi.fn();
  render(
    <PaymentMethods
      methods={PAYMENT_METHOD_CODE}
      method="CARD"
      onSelect={onSelect}
      realGateway={false}
      {...over}
    />,
  );
  return { onSelect };
};

const group = () => screen.getByRole('radiogroup');
const radio = (name: string) => within(group()).getByRole('radio', { name });
const radios = () => within(group()).getAllByRole('radio');

describe('묶음의 생김새', () => {
  /** role 을 얹는 순간 ul 의 목록 의미가 사라져 그 안의 li 가 갈 곳을 잃는다 */
  it('라디오 묶음에 이름이 있다', () => {
    open();

    expect(group()).toHaveAccessibleName('결제 수단');
  });

  it('받은 수단마다 라디오가 하나씩 선다', () => {
    open();

    expect(radios()).toHaveLength(PAYMENT_METHOD_CODE.length);
  });

  it('코드가 아니라 사람 말로 적는다', () => {
    open();

    const names = radios().map((r) => r.textContent);
    expect(names).toEqual(['신용·체크카드', '계좌이체', '가상계좌', '간편결제']);
    for (const code of PAYMENT_METHOD_CODE) expect(names.join(' ')).not.toContain(code);
  });

  it('고른 것 하나만 선택으로 보인다', () => {
    open({ method: 'TRANSFER' });

    const checked = radios().filter((r) => r.getAttribute('aria-checked') === 'true');
    expect(checked.map((r) => r.textContent)).toEqual(['계좌이체']);
  });
});

/**
 * **항목 전부가 탭 순서에 있었다.** 수단이 넷이면 탭을 네 번 눌러야 다음 칸으로 넘어간다.
 * 규칙은 고른 것 하나만 탭에 두고 나머지는 빼는 것이다(로빙 tabindex).
 */
describe('탭 순서', () => {
  it('고른 것 하나만 탭으로 들어온다', () => {
    open({ method: 'VIRTUAL_ACCOUNT' });

    const stops = radios().filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops.map((r) => r.textContent)).toEqual(['가상계좌']);
  });

  /** 아무것도 0 이 아니면 묶음 전체가 탭 순서에서 빠져 키보드로는 들어갈 수도 없다 */
  it('고른 것이 목록에 없어도 들어갈 자리는 남는다', () => {
    open({ methods: ['CARD', 'TRANSFER'], method: 'EASY_PAY' as PaymentMethodInput });

    const stops = radios().filter((r) => r.getAttribute('tabindex') === '0');
    expect(stops).toHaveLength(1);
  });
});

/**
 * 라디오 묶음은 탭으로 들어가 **화살표로 고르는 것**이 규칙이다. 낭독기 사용자는
 * "라디오 그룹" 이라는 말을 듣고 화살표를 누르는데 아무 일도 일어나지 않았다.
 */
describe('화살표로 고르기', () => {
  it('누르면 그 수단을 고른다', async () => {
    const { onSelect } = open();

    await userEvent.click(radio('가상계좌'));

    expect(onSelect).toHaveBeenCalledWith('VIRTUAL_ACCOUNT');
  });

  it.each([
    ['ArrowRight', 'CARD', 'TRANSFER'],
    ['ArrowDown', 'CARD', 'TRANSFER'],
    ['ArrowLeft', 'TRANSFER', 'CARD'],
    ['ArrowUp', 'TRANSFER', 'CARD'],
  ] as const)('%s 는 %s 에서 %s 로 옮긴다', async (key, from, to) => {
    const { onSelect } = open({ method: from });

    radios().find((r) => r.getAttribute('tabindex') === '0')!.focus();
    await userEvent.keyboard(`{${key}}`);

    expect(onSelect).toHaveBeenCalledWith(to);
  });

  /** 끝에서 처음으로 돈다. 라디오 묶음의 규칙이다. */
  it('끝에서 한 번 더 누르면 처음으로 돈다', async () => {
    const { onSelect } = open({ method: 'EASY_PAY' });

    radios().find((r) => r.getAttribute('tabindex') === '0')!.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(onSelect).toHaveBeenCalledWith('CARD');
  });

  it.each([
    ['Home', 'CARD'],
    ['End', 'EASY_PAY'],
  ] as const)('%s 는 %s 로 간다', async (key, expected) => {
    const { onSelect } = open({ method: 'TRANSFER' });

    radios().find((r) => r.getAttribute('tabindex') === '0')!.focus();
    await userEvent.keyboard(`{${key}}`);

    expect(onSelect).toHaveBeenCalledWith(expected);
  });

  /** 화살표로 화면이 스크롤되면 고르는 동안 자리가 흔들린다 */
  it('고르는 키는 화면을 굴리지 않는다', () => {
    open();
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });

    radios()[0]!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('고르는 데 안 쓰는 키는 가만둔다', () => {
    open();
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });

    radios()[0]!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

/**
 * **무엇으로 도는지 사실대로 말한다.** 결제창이 뜨지 않는데 주문이 완료되는 것은 놀랄
 * 일이라 미리 알려야 하고, 반대로 실제 결제창이 뜰 때 "연동이 안 됐다" 고 적혀 있으면
 * 그것대로 사람을 헷갈리게 만든다.
 */
describe('무엇으로 도는지', () => {
  it('실제 결제창이면 창이 열린다고 적는다', () => {
    open({ realGateway: true });

    expect(screen.getByText(/토스 결제창이 열립니다/)).toBeDefined();
  });

  it('Mock 이면 창 없이 끝난다는 것을 미리 알린다', () => {
    open({ realGateway: false });

    expect(screen.getByText(/결제창 없이 주문이 완료됩니다/)).toBeDefined();
    expect(screen.queryByText(/토스 결제창이 열립니다/)).toBeNull();
  });

  /** 어느 쪽이든 "실제 청구는 없다" 는 말이 빠지면 사람이 결제 직전에 멈춘다 */
  it.each([true, false])('실제 돈이 안 나간다는 말을 뺀 적이 없다 — 실제 결제창 %s', (real) => {
    open({ realGateway: real });

    expect(screen.getByText(/실제 (청구는 발생하지|결제는 발생하지) 않습니다/)).toBeDefined();
  });

  it('두 문장이 같지 않다 — 같으면 둘 중 하나는 거짓이다', () => {
    const { container: on } = render(
      <PaymentMethods methods={PAYMENT_METHOD_CODE} method="CARD" onSelect={vi.fn()} realGateway />,
    );
    const { container: off } = render(
      <PaymentMethods methods={PAYMENT_METHOD_CODE} method="CARD" onSelect={vi.fn()} realGateway={false} />,
    );

    expect(on.textContent).not.toBe(off.textContent);
  });
});

/**
 * **감추는 쪽과 막는 쪽이 저마다 'EASY_PAY' 를 적고 있었다.**
 *
 * 간편결제는 토스 결제창에서 제공사를 함께 지정해야 하는데 그 연동이 아직 없다. 실제 키가
 * 든 환경에서 이것만 Mock 으로 빠지면 **결제창도 안 뜨는데 주문이 결제 완료가 된다.**
 * 그래서 화면이 감추고(`checkout-form`) 결제를 거는 쪽도 막는데(`pay-order`), 목록이 두
 * 군데 있으면 연동 안 된 수단이 하나 더 생겨 한쪽에만 적히는 날 그 일이 돌아온다.
 */
describe('내놓는 수단과 창을 여는 수단', () => {
  it('실제 결제창일 때 내놓는 것은 전부 창을 열 수 있다', () => {
    for (const method of offeredMethods(true)) {
      expect(canOpenWindow(method), method).toBe(true);
    }
  });

  it.each(WINDOW_UNSUPPORTED_METHOD)('%s 는 실제 결제창일 때 고르개에 없다', (method) => {
    expect(offeredMethods(true)).not.toContain(method);
    expect(canOpenWindow(method)).toBe(false);
  });

  /** Mock 으로 돌 때는 어차피 창을 안 연다 — 넷을 다 보여 주는 편이 낫다 */
  it('Mock 환경에서는 하나도 감추지 않는다', () => {
    expect([...offeredMethods(false)]).toEqual([...PAYMENT_METHOD_CODE]);
  });

  /*
   * **미리 골라 둔 것이 고르개에 없으면 아무 칸도 선택으로 안 보인다.** 낭독기는 "아무것도
   * 안 골랐다" 고 읽는데 폼은 그 수단으로 보낸다 — 들은 것과 보내는 것이 갈린다.
   */
  it.each([true, false])('처음 골라 둔 수단은 고르개에 있다 — 실제 결제창 %s', (real) => {
    expect(offeredMethods(real)).toContain(DEFAULT_PAYMENT_METHOD);
  });

  it('실제 결제창에서도 고를 것이 남는다 — 전부 감추면 결제를 못 한다', () => {
    expect(offeredMethods(true).length).toBeGreaterThan(0);
  });

  it('감추는 목록은 실제로 수단 중에서 고른다 — 오타면 아무것도 안 감춘다', () => {
    for (const method of WINDOW_UNSUPPORTED_METHOD) {
      expect(PAYMENT_METHOD_CODE).toContain(method);
    }
  });
});
