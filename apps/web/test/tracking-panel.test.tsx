// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { CARRIERS } from '@shop/core';

vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));

const { TrackingPanel } = await import('~/components/tracking-panel');

/**
 * 손님이 보는 배송 조회. **문장 다섯이 전부 안 돌았다.**
 *
 * 이 조각이 지키는 것은 **링크가 죽는 날**이다. 택배사가 조회 주소를 바꾸거나
 * 없애면 링크만 둔 화면에서 손님은 아무것도 할 수 없다 — 그래서 송장번호를
 * **늘 글자로** 두고, 번호가 손에 있으면 택배사 사이트에 직접 넣어 볼 수 있다.
 *
 * 그 뜻은 지우기도 쉽다: "링크가 있으니 번호는 접자" 는 다음 사람에게 자연스럽다.
 */

const panel = async (over: Record<string, unknown> = {}) =>
  render(<>{await TrackingPanel({
    carrier: 'CJ',
    trackingNumber: '123456789012',
    shippedAt: new Date('2026-11-20T03:00:00Z'),
    ...over,
  })}</>);

describe('송장번호는 늘 글자로 둔다', () => {
  it('링크가 있어도 번호를 글자로 보여 준다 — 링크가 죽는 날이 있다', async () => {
    await panel();

    expect(screen.getByRole('link')).toBeInTheDocument();
    expect(screen.getByText('1234-5678-9012')).toBeInTheDocument();
  });

  it('네 자리씩 끊는다 — 옮겨 적을 때 덜 틀린다', async () => {
    await panel({ trackingNumber: '1234567890123' });

    expect(screen.getByText('1234-5678-9012-3')).toBeInTheDocument();
  });

  it('골라 복사할 수 있게 둔다', async () => {
    const { container } = await panel();

    expect(container.querySelector('.select-all')?.textContent).toBe('1234-5678-9012');
  });
});

describe('택배사를 모를 때', () => {
  it('이름을 모르면 받은 코드를 그대로 보여 준다 — 빈 칸으로 두지 않는다', async () => {
    await panel({ carrier: 'NEW_COURIER' });

    expect(screen.getByText('NEW_COURIER')).toBeInTheDocument();
  });

  it('조회 주소가 없으면 링크 대신 직접 넣어 보라고 적는다', async () => {
    /* 빈 자리를 두면 손님은 "조회가 안 되는구나" 로 읽고 멈춘다 */
    await panel({ carrier: 'NEW_COURIER' });

    /* '조회' 는 제목에도 있다 — 그 문구로 정확히 집는다 */
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/위 송장번호로 조회/)).toBeInTheDocument();
  });

  it('아는 택배사는 그 이름으로 적는다', async () => {
    await panel({ carrier: 'CJ' });

    expect(screen.getByText(CARRIERS.find((c) => c.code === 'CJ')!.name)).toBeInTheDocument();
  });
});

describe('바깥으로 나가는 링크', () => {
  it('새 창으로 열고 opener 를 끊는다', async () => {
    await panel();

    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('새 창이라는 것을 이름에 넣는다 — 갑자기 창이 바뀌면 놀란다', async () => {
    await panel();

    expect(screen.getByRole('link').textContent).toMatch(/새 창|새 탭/);
  });

  it('번호를 그 주소에 싣는다', async () => {
    await panel();

    expect(screen.getByRole('link').getAttribute('href')).toContain('123456789012');
  });
});

describe('보낼 것이 없으면', () => {
  it.each([
    ['택배사가 없으면', { carrier: null }],
    ['번호가 없으면', { trackingNumber: null }],
  ])('%s 이 절을 아예 세우지 않는다', async (_what, over) => {
    const { container } = await panel(over);

    expect(container).toBeEmptyDOMElement();
  });

  it('보낸 날이 없으면 그 줄만 없다 — 번호는 그대로 보인다', async () => {
    await panel({ shippedAt: null });

    expect(screen.getByText('1234-5678-9012')).toBeInTheDocument();
    expect(screen.queryByText('출고일')).toBeNull();
  });
});

describe('읽을 수 있게 둔다', () => {
  it('제목 붙은 절이다 — 낭독기가 이 자리를 건너뛸 수 있다', async () => {
    await panel();

    const section = screen.getByRole('region', { name: /배송|조회/ });
    expect(within(section).getByText('1234-5678-9012')).toBeInTheDocument();
  });
});
