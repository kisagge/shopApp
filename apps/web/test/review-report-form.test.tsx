// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ReviewReport } = await import('~/components/review-report');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response('{"reported":true}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const setup = (over: Record<string, unknown> = {}) =>
  render(<ReviewReport reviewId="r-1" alreadyReported={false} {...over} />);

describe('이미 신고한 글', () => {
  it('버튼 대신 상태를 보여 준다', () => {
    /*
     * 눌러 보고 "이미 신고했습니다" 를 받는 것과 처음부터 그렇게 적혀
     * 있는 것은 다르다. 뒤늦게 막는 화면은 사람을 두 번 헛되게 한다.
     */
    setup({ alreadyReported: true });

    expect(screen.getByText('신고함')).toBeDefined();
    expect(screen.queryByRole('button', { name: '신고' })).toBeNull();
  });
});

describe('신고 양식', () => {
  it('처음에는 접혀 있고 펼침 상태를 알린다', () => {
    setup();
    const button = screen.getByRole('button', { name: '신고' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it('사유는 이름 있는 묶음으로 읽힌다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    expect(screen.getByRole('group', { name: '신고 사유' })).toBeDefined();
    expect(screen.getByRole('radio', { name: '광고 · 도배' })).toBeDefined();
  });

  it('글은 그대로 남는다고 미리 알린다', async () => {
    // 누른 뒤 아무 변화가 없으면 눌리지 않은 줄 알고 다시 누른다
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    expect(screen.getByText(/글은 그대로 남습니다/)).toBeDefined();
  });

  it('고른 사유와 설명을 보낸다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('radio', { name: '개인정보 노출' }));
    await userEvent.type(screen.getByRole('textbox'), '전화번호가 적혀 있습니다');
    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reviews/r-1/report',
      expect.objectContaining({ method: 'POST' }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toEqual({ reason: 'PRIVACY', detail: '전화번호가 적혀 있습니다' });
  });

  it('설명을 비우면 null 로 보낸다 — 빈 문자열을 저장할 이유가 없다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).detail).toBeNull();
  });

  it('보내고 나면 신고함으로 바뀐다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    expect(await screen.findByText('신고함')).toBeDefined();
  });
});

describe('실패', () => {
  it('서버가 말한 이유를 그대로 보여 준다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"이미 신고한 리뷰입니다."}', { status: 409 }),
    );
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText('이미 신고한 리뷰입니다.')).toBeDefined();
  });

  it('실패해도 양식이 남는다 — 다시 시도할 수 있어야 한다', async () => {
    fetchMock.mockRejectedValue(new Error('오프라인'));
    setup();
    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('group', { name: '신고 사유' })).toBeDefined();
  });
});
