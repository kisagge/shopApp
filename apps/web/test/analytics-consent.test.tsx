// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const discard = vi.hoisted(() => vi.fn());
vi.mock('~/lib/analytics/client', () => ({ getTracker: () => ({ discard }) }));

const { AnalyticsConsentToggle } = await import('~/components/analytics-consent-toggle');
const { getLocalConsent } = await import('~/lib/analytics/consent');

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

describe('이용 기록 수집 끄고 켜기', () => {
  it('기본은 수집한다 — 남기는 것이 익명 식별자와 해시한 IP 뿐이다', () => {
    render(<AnalyticsConsentToggle />);
    expect(screen.getByText('수집 중')).toBeTruthy();
  });

  it('끄면 기억한다 — 다음에 와도 꺼져 있어야 한다', async () => {
    const user = userEvent.setup();
    render(<AnalyticsConsentToggle />);

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(getLocalConsent()).toBe(false);
    expect(screen.getByText('수집하지 않음')).toBeTruthy();
  });

  it('끄는 순간 큐에 남은 것도 버린다 — 마지막으로 한 번 더 나가면 거부가 아니다', async () => {
    const user = userEvent.setup();
    render(<AnalyticsConsentToggle />);

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('다시 켤 수 있다 — 한 번 끄면 되돌릴 수 없으면 그것도 강요다', async () => {
    const user = userEvent.setup();
    render(<AnalyticsConsentToggle />);

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));
    await user.click(screen.getByRole('button', { name: '수집 허용하기' }));

    expect(getLocalConsent()).toBe(true);
    expect(discard).toHaveBeenCalledTimes(1);
  });
});
