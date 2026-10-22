// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi } from 'vitest';

vi.mock('~/lib/i18n/server', () => ({ getLocale: async () => 'ko' }));

const { NoticeLines } = await import('~/components/notice-lines');

/**
 * 공지 목록의 한 줄들.
 *
 * 목록 화면과 고객센터 앞머리가 **같은 조각**을 쓴다 — 두 벌로 두면 한쪽만 고치게 되고,
 * 그때 두 화면이 다른 공지를 보여 준다. 그 조각에 검사가 없었다.
 *
 * 서버 조각이라 불러서 그 결과를 그린다.
 */

const notice = (over: Partial<Parameters<typeof NoticeLines>[0]['notices'][number]> = {}) => ({
  id: 'n-1', title: '추석 배송 안내', body: '본문', topic: null,
  pinned: false, publishedAt: new Date('2026-09-20T00:00:00Z'),
  ...over,
});

const show = async (notices: Parameters<typeof NoticeLines>[0]['notices']) =>
  render(await NoticeLines({ notices, empty: '아직 공지가 없습니다.' }));

describe('공지 줄', () => {
  it('없으면 받은 문구로 빈자리를 말한다', async () => {
    /*
     * 빈 목록을 그냥 비워 두면 "안 불러와진 것" 과 "없는 것" 이 같아 보인다. 문구는 부르는
     * 쪽이 넘긴다 — 같은 조각이 고객센터 앞머리에도 쓰이므로 거기 맞는 말이 다르다.
     */
    await show([]);
    expect(screen.getByText('아직 공지가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('줄마다 그 공지로 간다', async () => {
    await show([notice({ id: 'n-7' })]);
    expect(screen.getByRole('link', { name: /추석 배송 안내/ })).toHaveAttribute(
      'href', '/support/notice/n-7',
    );
  });

  it('고정한 공지에 표가 붙고, 그 표는 낭독기가 읽지 않는다', async () => {
    /*
     * 고정은 눈에 띄라고 하는 것이다. 다만 ● 를 읽어 주면 제목 앞에 뜻 없는 글자가 하나
     * 더 들리고, 고정 여부는 차례가 이미 말한다(고정이 먼저 온다).
     */
    const { container } = await show([notice({ pinned: true })]);

    const mark = container.querySelector('[aria-hidden="true"]');
    expect(mark?.textContent).toBe('●');
    expect(screen.getByRole('link', { name: /추석 배송 안내/ }).textContent).toContain('●');
  });

  it('고정이 아니면 표가 없다', async () => {
    const { container } = await show([notice()]);
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it('내보낸 날을 기계가 읽는 값과 함께 적는다', async () => {
    await show([notice()]);
    expect(screen.getByRole('time')).toHaveAttribute('dateTime', '2026-09-20T00:00:00.000Z');
  });

  it('아직 안 내보낸 글에는 날짜 자리를 두지 않는다', async () => {
    // 운영 목록에서는 초안도 보인다. 날짜 없이 온 줄에 빈 시각을 그리면 "0" 같은 것이 뜬다
    await show([notice({ publishedAt: null })]);
    expect(screen.queryByRole('time')).toBeNull();
  });
});
