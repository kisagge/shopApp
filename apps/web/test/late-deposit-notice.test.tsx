// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { LateDepositNotice } from '~/components/late-deposit-notice';

/** 취소한 주문에 들어온 입금 — 손님이 할 일과, 끝났다는 말 */

const t = createTranslator('ko');
const at = new Date('2026-09-16T00:00:00Z');

describe('LateDepositNotice', () => {
  it('그런 입금이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(
      <LateDepositNotice payment={{ lateDepositAt: null, lateDepositAmount: null, lateDepositResolvedAt: null }} locale="ko" t={t} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('결제가 없는 주문도 그리지 않는다', () => {
    const { container } = render(<LateDepositNotice payment={null} locale="ko" t={t} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('돌려주기 전에는 금액과 할 일, 그 일을 하러 가는 길을 준다', () => {
    render(<LateDepositNotice payment={{ lateDepositAt: at, lateDepositAmount: 289_000, lateDepositResolvedAt: null }} locale="ko" t={t} />);

    const region = screen.getByRole('region', { name: '취소한 주문에 입금이 확인되었습니다' });
    expect(region).toHaveTextContent('289,000원이 들어왔지만');
    expect(region).toHaveTextContent('은행·계좌번호·예금주');
    expect(screen.getByRole('link', { name: '1:1 문의로 계좌 알려 주기' })).toHaveAttribute('href', '/support/ask');
  });

  it('돌려준 뒤에는 언제 얼마를 돌려줬는지 말하고, 더 할 일을 내밀지 않는다', () => {
    render(
      <LateDepositNotice
        payment={{ lateDepositAt: at, lateDepositAmount: 289_000, lateDepositResolvedAt: new Date('2026-09-18T03:00:00Z') }}
        locale="ko" t={t}
      />,
    );

    const region = screen.getByRole('region', { name: '취소 뒤 입금한 돈을 돌려드렸습니다' });
    expect(region).toHaveTextContent('289,000원을');
    expect(region).toHaveTextContent('2026');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('다른 말로도 읽힌다', () => {
    render(
      <LateDepositNotice
        payment={{ lateDepositAt: at, lateDepositAmount: 289_000, lateDepositResolvedAt: null }}
        locale="en" t={createTranslator('en')}
      />,
    );
    expect(screen.getByRole('region', { name: 'We received a transfer for this cancelled order' })).toHaveTextContent('289,000 KRW');
  });
});
