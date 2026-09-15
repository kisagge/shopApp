// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { ReviewReplyForm } = await import('~/components/admin/review-reply-form');

/** 운영 리뷰 화면의 판매자 답글 칸 */
const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({}));
});

describe('판매자 답글 폼', () => {
  it('답이 없으면 이름 붙은 입력칸과 공개된다는 설명이 있고, 달면 알림이 간다고 알린다', async () => {
    const user = userEvent.setup();
    render(<ReviewReplyForm reviewId="r-1" productName="레더 카드 지갑" reply={null} />);

    const box = screen.getByLabelText('레더 카드 지갑 리뷰에 남길 답글');
    expect(document.getElementById(box.getAttribute('aria-describedby')!)?.textContent).toContain('공개됩니다');
    await user.type(box, '감사합니다');
    await user.click(screen.getByRole('button', { name: '답글 달기' }));

    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('알림이 갑니다'));
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/admin/reviews/r-1/reply');
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ reply: '감사합니다' }) });
    expect(refresh).toHaveBeenCalled();
  });

  it('빈 답은 보내지 않고 알린다', async () => {
    const user = userEvent.setup();
    render(<ReviewReplyForm reviewId="r-1" productName="지갑" reply={null} />);
    await user.click(screen.getByRole('button', { name: '답글 달기' }));
    expect(screen.getByRole('alert').textContent).toContain('답글을 입력해 주세요');
    expect(screen.getByLabelText('지갑 리뷰에 남길 답글').getAttribute('aria-invalid')).toBe('true');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('답이 있으면 글을 보여 주고, 지우기는 한 번 더 묻고 DELETE 로 보낸다', async () => {
    const user = userEvent.setup();
    render(<ReviewReplyForm reviewId="r-1" productName="지갑" reply="옛 답" />);
    expect(screen.getByText('옛 답')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();

    await user.click(screen.getByRole('button', { name: '답글 지우기' }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '답글 지우기 확인' }));
    await waitFor(() => expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: 'DELETE' }));
  });

  it('고치기를 누르면 지금 답이 채워진 칸이 열린다', async () => {
    const user = userEvent.setup();
    render(<ReviewReplyForm reviewId="r-1" productName="지갑" reply="옛 답" />);
    await user.click(screen.getByRole('button', { name: '답글 고치기' }));
    expect(screen.getByLabelText<HTMLTextAreaElement>('지갑 리뷰에 남길 답글').value).toBe('옛 답');
    expect(screen.getByRole('button', { name: '답글 저장' })).toBeTruthy();
  });
});
