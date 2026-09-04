// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { ReviewModeration } = await import('~/components/admin/review-moderation');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const setup = (over: Record<string, unknown> = {}) =>
  render(<ReviewModeration reviewId="r-1" removed={false} openReports={2} {...over} />);

describe('글 내리기', () => {
  it('한 번에 내리지 않고 확인을 받는다', async () => {
    // 남의 글을 지우는 일이다. 되돌릴 수 있어도 그 사이 화면에서는 사라진다.
    setup();
    await userEvent.click(screen.getByRole('button', { name: '글 내리기' }));

    expect(screen.getByText(/이 글을 내릴까요/)).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('확인하면 삭제 API 를 부른다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '글 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '내린다' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/reviews/r-1', { method: 'DELETE' });
  });

  it('취소하면 아무 일도 없다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '글 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '글 내리기' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('문제없음', () => {
  it('확인 없이 바로 닫는다 — 같은 자리에서 되돌릴 수 있다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/reviews/r-1/dismiss', { method: 'POST' });
  });

  it('닫을 신고가 없으면 버튼도 없다', async () => {
    setup({ openReports: 0 });
    expect(screen.queryByRole('button', { name: '문제없음' })).toBeNull();
  });
});

describe('내려간 글', () => {
  it('되돌리기만 보여 준다', () => {
    setup({ removed: true });

    expect(screen.getByRole('button', { name: '되돌리기' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '글 내리기' })).toBeNull();
  });

  it('되돌리면 복구 API 를 부른다', async () => {
    /*
     * 잘못 내리는 일은 실제로 일어난다. 되돌릴 문이 없으면 글쓴이는 영영
     * 잃는다 — 같은 구매로 다시 쓸 수도 없다.
     */
    setup({ removed: true });
    await userEvent.click(screen.getByRole('button', { name: '되돌리기' }));

    expect(fetchMock).toHaveBeenCalledWith('/api/admin/reviews/r-1/restore', { method: 'POST' });
  });
});

describe('끝난 뒤', () => {
  it('목록을 다시 읽는다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    expect(refresh).toHaveBeenCalled();
  });

  it('실패하면 이유를 보여 주고 목록을 건드리지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"처리할 신고가 없습니다."}', { status: 409 }));
    setup();
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByText('처리할 신고가 없습니다.')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('네트워크가 끊겨도 버튼이 잠기지 않는다', async () => {
    // 눌린 채로 굳으면 새로고침 말고는 방법이 없다
    fetchMock.mockRejectedValue(new Error('오프라인'));
    setup();
    await userEvent.click(screen.getByRole('button', { name: '문제없음' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('button', { name: '문제없음' })).not.toHaveProperty('disabled', true);
  });
});
