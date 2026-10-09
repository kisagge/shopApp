// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect } from 'vitest';
import { CouponTable } from '~/app/admin/coupons/coupon-table';
import type { CouponRow } from '~/app/admin/coupons/types';

/**
 * 발행한 쿠폰 표의 **대상 칸** — 무엇에 걸었는지 거기서 읽을 수 있어야 한다.
 *
 * 이 칸에는 "지정 3개" 만 적혀 있었다. 대상은 만들 때만 정하고 다시 열어 볼 화면이 없으니,
 * 그 수를 보고 할 수 있는 일이 없다. 더 나쁜 것은 **어떤 상품에도 붙지 않는 쿠폰**(상위 분류에
 * 걸어 둔 쿠폰)이 멀쩡한 쿠폰과 똑같이 보인다는 것이다 — 손님에게는 "쓸 수 없습니다" 로만
 * 나타나고, 운영은 그것이 왜인지 알 길이 없다. 색이나 수가 아니라 **글자로** 짚는다.
 */

const row = (over: Partial<CouponRow> = {}): CouponRow => ({
  id: 'c-1', code: 'AUTUMN20', name: '가을 쿠폰', kind: 'PERCENT',
  value: 0, percent: 20, maxDiscount: null, minimumOrder: 0,
  issueLimit: null, issuedCount: 0, usedCount: 0,
  startsAt: '2026-09-01T00:00:00+09:00', endsAt: '2026-09-30T23:59:59+09:00',
  isActive: true, downloadable: false, status: 'ACTIVE', editable: true,
  targetCount: 0, targetNames: [], deadTargets: false,
  ...over,
});

const renderTable = (coupon: CouponRow) =>
  render(
    <CouponTable
      coupons={[coupon]}
      pending={false}
      onToggle={() => {}}
      onGrant={() => {}}
      onToggleDownload={() => {}}
    />,
  );

/** 대상 칸 — 줄 머리(쿠폰)·할인·최소 주문 다음 */
const target = () =>
  within(screen.getByRole('row', { name: /가을 쿠폰/ })).getAllByRole('cell')[2]!;

describe('대상 칸', () => {
  it('대상이 없으면 전체라고 적는다', () => {
    renderTable(row());

    expect(target().textContent).toBe('전체');
  });

  it('대상 이름을 적는다 — 수만으로는 아무것도 알 수 없다', () => {
    renderTable(row({ targetCount: 2, targetNames: ['울 코트', 'MOOR'] }));

    expect(target().textContent).toContain('울 코트, MOOR');
    expect(target().textContent).not.toContain('지정 2개');
  });

  /** 한 쿠폰에 수십 개를 걸 수 있다 — 표가 세로로 늘어지면 목록을 못 읽는다 */
  it('많으면 셋만 적고 나머지는 수로 센다', () => {
    renderTable(row({
      targetCount: 5,
      targetNames: ['울 코트', 'MOOR', '코트', '패딩', '니트'],
    }));

    const text = target().textContent;
    expect(text).toContain('울 코트, MOOR, 코트');
    expect(text).toContain('외 2개');
    expect(text).not.toContain('패딩');
  });

  it('붙는 상품이 없으면 그렇게 말하고, 무엇을 해야 하는지도 적는다', () => {
    renderTable(row({ targetCount: 1, targetNames: ['아우터'], deadTargets: true }));

    const text = target().textContent;
    expect(text).toContain('아우터');
    expect(text).toContain('붙는 상품 없음');
    expect(text).toContain('하위 분류로 다시 만들어 주세요');
  });

  it('멀쩡한 쿠폰에는 경고를 달지 않는다', () => {
    renderTable(row({ targetCount: 1, targetNames: ['코트'] }));

    expect(target().textContent).not.toContain('붙는 상품 없음');
  });
});
