// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import { LastEdited } from '~/components/admin/last-edited';
import { adminTimestamp } from '~/lib/admin/date-format';

/** 마지막 수정 한 줄 — 때는 기계가 읽는 값과 한국 시각을 함께 */
describe('LastEdited', () => {
  it('한국 시각으로 적고 time 요소에 원래 값을 둔다', () => {
    render(<LastEdited at="2026-09-15T06:20:00.000Z" by="박운영 · 관리자" />);

    // 서울 시각 15:20 — 운영 화면의 다른 줄과 같은 모양(adminTimestamp)이다
    const shown = adminTimestamp.format(new Date('2026-09-15T06:20:00Z'));
    expect(shown).toMatch(/2026\. 09\. 15\..*03:20|15:20/);
    const time = screen.getByText(shown);
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('dateTime', '2026-09-15T06:20:00.000Z');
    expect(time.closest('p')).toHaveTextContent(`마지막 수정 ${shown} · 박운영 · 관리자`);
  });
});
