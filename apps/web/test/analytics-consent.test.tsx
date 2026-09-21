// @vitest-environment jsdom
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const discard = vi.hoisted(() => vi.fn());
vi.mock('~/lib/analytics/client', () => ({ getTracker: () => ({ discard }) }));
const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const { AnalyticsConsentToggle } = await import('~/components/analytics-consent-toggle');
const { getLocalConsent } = await import('~/lib/analytics/consent');

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  // 동의는 계정에도 남는다 — 창구가 받아 준다고 두고 본다
  fetchMock.mockResolvedValue(Response.json({ analytics: false }));
  vi.stubGlobal('fetch', fetchMock);
});

/** 계정에 아직 거부가 적혀 있지 않은 사람 */
const draw = (initial = true) => render(<AnalyticsConsentToggle initial={initial} />);

describe('이용 기록 수집 끄고 켜기', () => {
  it('기본은 수집한다 — 남기는 것이 익명 식별자와 해시한 IP 뿐이다', () => {
    draw();
    expect(screen.getByText('수집 중')).toBeTruthy();
  });

  it('끄면 기억한다 — 다음에 와도 꺼져 있어야 한다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(getLocalConsent()).toBe(false);
    expect(screen.getByText('수집하지 않음')).toBeTruthy();
  });

  it('끄는 순간 큐에 남은 것도 버린다 — 마지막으로 한 번 더 나가면 거부가 아니다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('다시 켤 수 있다 — 한 번 끄면 되돌릴 수 없으면 그것도 강요다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));
    await user.click(screen.getByRole('button', { name: '수집 허용하기' }));

    expect(getLocalConsent()).toBe(true);
    expect(discard).toHaveBeenCalledTimes(1);
  });
});

/**
 * **끈 것이 이 기기에만 남았다.** 수집 창구는 계정의 거부(DENIED)를 존중하는데 그 값을 만드는 곳이 탈퇴 처리뿐이라,
 * 기기나 브라우저를 바꾸면 껐던 추적이 조용히 되살아났다. 마케팅 동의는 진작 계정에 저장하고 있었다.
 */
describe('계정에도 남는다', () => {
  it('끄면 계정에 적는다 — 다른 기기에서도 꺼져 있어야 한다', async () => {
    const user = userEvent.setup();
    draw();

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/account/consent', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ analytics: false }),
    }));
  });

  it('계정이 이미 거부면 이 기기에서 처음 열어도 꺼져 있다', () => {
    draw(false);

    expect(screen.getByText('수집하지 않음')).toBeTruthy();
    expect(screen.getByRole('button', { name: '수집 허용하기' })).toBeTruthy();
  });

  it('저장하지 못하면 켠 채로 두고 그렇게 말한다 — 껐다고 해 놓고 안 껐으면 거짓말이다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    draw();

    await user.click(screen.getByRole('button', { name: '수집 그만두기' }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(getLocalConsent(), '저장에 실패했는데 이 기기만 꺼 두면 둘이 갈린다').toBe(true);
    expect(discard).not.toHaveBeenCalled();
  });
});
