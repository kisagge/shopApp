// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect } from 'vitest';
import { translatorFor } from '@shop/i18n';
import { ko } from '@shop/i18n/messages/ko';
import { en } from '@shop/i18n/messages/en';
import type { PointExpiryDay } from '@shop/core';
import { PointExpirySchedule } from '~/components/point-expiry-schedule';

/**
 * 날짜별 소멸 예정 표. 날짜 묶기와 짝짓기는 core 가 본다 — 여기서는 **읽히는가**를 본다.
 */
const t = translatorFor('ko', ko);

const day = (date: string, amount: number, daysLeft: number): PointExpiryDay => ({
  date, amount, daysLeft, expiresAt: new Date(`${date}T03:00:00Z`),
});

const SCHEDULE = [day('2026-09-04', 150, 0), day('2026-09-20', 1200, 16), day('2027-03-01', 3000, 178)];

describe('소멸 예정 표', () => {
  it('제목·캡션·열 머리를 갖춘 표로, 날짜가 행 머리다', () => {
    render(<PointExpirySchedule schedule={SCHEDULE} noticeDays={30} locale="ko" t={t} />);
    expect(screen.getByRole('region', { name: '소멸 예정' })).toBeTruthy();
    const table = screen.getByRole('table', { name: '날짜별 소멸 예정 포인트' });
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['소멸 예정일', '남은 기간', '포인트']);
    expect(within(table).getAllByRole('rowheader').map((h) => h.querySelector('time')?.getAttribute('dateTime')))
      .toEqual(['2026-09-04', '2026-09-20', '2027-03-01']);
  });

  it('남은 기간을 글자로 적는다 — 오늘이면 "오늘", 아니면 날수', () => {
    render(<PointExpirySchedule schedule={SCHEDULE} noticeDays={30} locale="ko" t={t} />);
    const rows = screen.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell').map((c) => c.textContent))).toEqual([
      ['오늘', '150P'],
      ['16일 남음', '1,200P'],
      ['178일 남음', '3,000P'],
    ]);
  });

  it('곧 사라지는 줄만 굵게 — 색만으로 가르지 않는다', () => {
    render(<PointExpirySchedule schedule={SCHEDULE} noticeDays={30} locale="ko" t={t} />);
    const [soon, , later] = screen.getAllByRole('row').slice(1);
    expect(within(soon!).getAllByRole('cell')[1]!.className).toContain('font-semibold');
    expect(within(later!).getAllByRole('cell')[1]!.className).not.toContain('font-semibold');
  });

  it('영어는 하루·여러 날을 가려 쓴다', () => {
    render(
      <PointExpirySchedule
        schedule={[day('2026-09-05', 10, 1), day('2026-09-06', 10, 2)]}
        noticeDays={30}
        locale="en"
        t={translatorFor('en', en)}
      />,
    );
    expect(screen.getByText('1 day left')).toBeTruthy();
    expect(screen.getByText('2 days left')).toBeTruthy();
  });

  it('예정이 없으면 표 대신 그렇다고 말한다', () => {
    render(<PointExpirySchedule schedule={[]} noticeDays={30} locale="ko" t={t} />);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('소멸 예정인 포인트가 없습니다.')).toBeTruthy();
  });
});
