// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createTranslator } from '@shop/i18n/all';
import { UNREAD_BADGE_MAX } from '@shop/core';

/**
 * 머리의 알림 종.
 *
 * **개수를 말로 전하는 자리다.** 뱃지의 숫자는 눈으로만 보이므로 낭독기에게는 링크의 이름이 전부다 —
 * 이름이 늘 "알림" 이면 안 읽은 것이 있는지조차 알 수 없다. 그런데 그 이름을 보는 검사가 단위에도 e2e 에도
 * 없었다(`알림, 안 읽은 N건` 이라는 글자가 e2e 전체에 한 번도 안 나온다).
 *
 * 반대쪽 실수도 조용하다. 아이콘과 뱃지의 `aria-hidden` 을 떼면 **같은 개수를 두 번 듣는다** —
 * 이름에서 한 번, 뱃지 숫자에서 또 한 번.
 */

const getViewer = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/viewer', () => ({ getViewer }));

const countUnread = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/queries/notifications', () => ({ countUnread }));

vi.mock('~/lib/i18n/server', () => ({ getT: () => Promise.resolve(createTranslator('ko')) }));

const { NotificationBell } = await import('~/components/notification-bell');

/** 로그인하지 않으면 null 을 돌려주므로 조각으로 감싸 그린다 */
const draw = async () => render(<>{await NotificationBell()}</>);

beforeEach(() => {
  vi.clearAllMocks();
  getViewer.mockResolvedValue({ id: 'u-1', role: 'CUSTOMER', merchantId: null, name: '손' });
  countUnread.mockResolvedValue(0);
});

describe('로그인하지 않았으면', () => {
  it('아무것도 그리지 않는다', async () => {
    getViewer.mockResolvedValue(null);
    const { container } = await draw();
    expect(container.innerHTML).toBe('');
  });

  it('세지도 않는다 — 누구의 것을 셀지가 없다', async () => {
    getViewer.mockResolvedValue(null);
    await draw();
    expect(countUnread).not.toHaveBeenCalled();
  });
});

describe('링크의 이름', () => {
  it('안 읽은 것이 없으면 그냥 알림이다', async () => {
    await draw();
    expect(screen.getByRole('link', { name: '알림' })).toBeInTheDocument();
  });

  it('안 읽은 것이 있으면 몇 건인지 이름에 적는다', async () => {
    /*
     * 뱃지의 숫자는 눈으로만 보인다. 이름이 바뀌지 않으면 낭독기로 듣는 사람에게는
     * 안 읽은 것이 있는지조차 전해지지 않는다.
     */
    countUnread.mockResolvedValue(3);
    await draw();

    expect(screen.getByRole('link', { name: '알림, 안 읽은 3건' })).toBeInTheDocument();
  });

  it('한 건이어도 수를 적는다', async () => {
    countUnread.mockResolvedValue(1);
    await draw();
    expect(screen.getByRole('link', { name: '알림, 안 읽은 1건' })).toBeInTheDocument();
  });
});

describe('뱃지', () => {
  it('안 읽은 것이 없으면 그리지 않는다', async () => {
    const { container } = await draw();
    expect(container.querySelector('span')).toBeNull();
  });

  it('안 읽은 수를 적는다', async () => {
    countUnread.mockResolvedValue(7);
    const { container } = await draw();
    expect(container.querySelector('span')?.textContent).toBe('7');
  });

  it(`많이 쌓이면 ${UNREAD_BADGE_MAX}+ 로 접는다 — 세 자리가 들어가면 글자가 깨진다`, async () => {
    // 접는 규칙은 core 가 갖는다(formatUnread). 여기서 보는 것은 그것을 쓰는지다
    countUnread.mockResolvedValue(UNREAD_BADGE_MAX + 1);
    const { container } = await draw();
    expect(container.querySelector('span')?.textContent).toBe(`${UNREAD_BADGE_MAX}+`);
  });

  it('숫자는 읽히지 않는다 — 이름이 이미 말했다', async () => {
    countUnread.mockResolvedValue(7);
    const { container } = await draw();
    expect(container.querySelector('span')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('아이콘', () => {
  it('장식이다 — 이름과 개수는 링크가 말한다', async () => {
    const { container } = await draw();
    expect(screen.queryByRole('img')).toBeNull();
    expect(container.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('어디로 가고, 누구의 것을 세는가', () => {
  it('알림함으로 간다', async () => {
    await draw();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/mypage/notifications');
  });

  it('보는 사람의 것만 센다', async () => {
    await draw();
    expect(countUnread).toHaveBeenCalledWith('u-1');
  });
});
