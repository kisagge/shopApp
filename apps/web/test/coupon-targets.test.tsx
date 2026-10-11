// @vitest-environment jsdom
import { render, screen, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { CouponTargets } from '~/app/admin/coupons/coupon-targets';
import type { CouponTarget } from '~/app/admin/coupons/types';

/**
 * 쿠폰을 **무엇에 걸었나** — 그 칸 하나.
 *
 * "지정 3개" 만 적혀 있던 자리다. 이름을 적기 시작했지만 셋까지였고, 스무 개를 걸어 둔 쿠폰은
 * "외 17개" 뒤에 가려졌다 — 그래서 펼칠 수 있게 한다. 그리고 **어떤 상품에도 붙지 않는 대상**은
 * 접은 채로도 보여야 한다: 문제를 보려고 펼쳐야 하면, 펼치지 않은 사람은 문제가 없다고 믿는다.
 */

const t = (name: string, over: Partial<CouponTarget> = {}): CouponTarget =>
  ({ type: 'PRODUCT', name, dead: false, ...over });

const renderTargets = (targets: CouponTarget[]) => render(<CouponTargets targets={targets} />);

/** 접힌 묶음의 머리 — 눌러서 펼치는 자리다(details/summary) */
const summary = () => screen.getByRole('group').querySelector('summary')!;

describe('셋까지는 그대로 적는다', () => {
  it('이름을 쉼표로 잇는다', () => {
    renderTargets([t('울 코트'), t('MOOR', { type: 'BRAND' })]);

    expect(screen.getByText('울 코트, MOOR')).toBeInTheDocument();
  });

  it('펼칠 것이 없으면 펼치는 자리도 만들지 않는다', () => {
    renderTargets([t('울 코트'), t('MOOR'), t('코트')]);

    expect(screen.queryByRole('group')).toBeNull();
    expect(screen.queryByText(/외 /)).toBeNull();
  });
});

describe('넷 이상이면 펼칠 수 있다', () => {
  const many = () => [t('가'), t('나'), t('다'), t('라'), t('마', { type: 'CATEGORY' })];

  it('접힌 채로는 셋과 남은 수만 보인다', () => {
    renderTargets(many());

    expect(summary().textContent).toContain('가, 나, 다');
    expect(summary().textContent).toContain('외 2개');
    // 접혀 있다 — 자바스크립트 없이도 details 가 혼자 감춘다
    expect(screen.getByRole('group')).not.toHaveAttribute('open');
  });

  it('펼치면 전부 보인다 — 접혔을 때 가려졌던 것까지', async () => {
    const user = userEvent.setup();
    renderTargets(many());

    await user.click(summary());

    const list = screen.getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getByText(/라/)).toBeInTheDocument();
    expect(within(list).getByText(/마/)).toBeInTheDocument();
  });

  /** "아우터" 만 적으면 그것이 분류인지 브랜드인지 알 수 없다 — core 의 이름표를 쓴다 */
  it('펼친 줄에는 종류도 적는다', async () => {
    const user = userEvent.setup();
    renderTargets([t('가'), t('나'), t('다'), t('MOOR', { type: 'BRAND' })]);

    await user.click(summary());

    expect(within(screen.getByRole('list')).getByText('(브랜드)')).toBeInTheDocument();
  });
});

/**
 * **붙는 상품이 없는 대상.** 조회가 죽은 것을 앞에 세우므로(listCoupons) 접힌 줄에 이미 보인다 —
 * 이 검사는 그 약속 위에서, 화면이 그 사실을 **글자로** 말하는지를 본다.
 */
describe('붙는 상품이 없으면', () => {
  it('그렇게 말하고, 무엇을 해야 하는지도 적는다', () => {
    renderTargets([t('아우터', { type: 'CATEGORY', dead: true })]);

    expect(screen.getByText('붙는 상품 없음')).toBeInTheDocument();
    expect(screen.getByText(/하위 분류로 다시 만들어 주세요/)).toBeInTheDocument();
  });

  it('둘 이상이면 몇 개인지 센다', () => {
    renderTargets([
      t('아우터', { type: 'CATEGORY', dead: true }),
      t('신발', { type: 'CATEGORY', dead: true }),
    ]);

    expect(screen.getByText(/붙는 상품 없음/).textContent).toContain('2개');
  });

  /** 펼친 줄에서도 어느 것이 문제인지 짚는다 — 스무 줄에서 하나를 찾는 일을 사람에게 맡기지 않는다 */
  it('펼친 목록에서 그 줄만 짚는다', async () => {
    const user = userEvent.setup();
    renderTargets([
      t('아우터', { type: 'CATEGORY', dead: true }),
      t('가'), t('나'), t('다'),
    ]);

    await user.click(summary());

    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(items[0]!.textContent).toContain('아우터');
    expect(items[0]!.textContent).toContain('붙는 상품 없음');
    expect(items[1]!.textContent).not.toContain('붙는 상품 없음');
  });

  it('멀쩡하면 아무 경고도 없다', () => {
    renderTargets([t('코트', { type: 'CATEGORY' })]);

    expect(screen.queryByText(/붙는 상품 없음/)).toBeNull();
  });
});
