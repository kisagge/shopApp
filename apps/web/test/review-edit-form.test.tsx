// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }));

const { ReviewEditForm } = await import('~/app/(shop)/mypage/reviews/[id]/edit/review-edit-form');

/**
 * 리뷰 수정 폼.
 *
 * **쓴 그대로를 채워 두고 시작한다.** 빈 폼을 주고 다시 쓰게 하면 한 글자를 고치려던 사람이 글 전체를 잃는다.
 */

const review = (over: Record<string, unknown> = {}) => ({
  id: 'r-1',
  rating: 4,
  content: '두껍고 따뜻합니다. 기장도 알맞았어요.',
  sizeFit: 'TRUE' as const,
  height: 175,
  weight: 70,
  images: [],
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: 'r-1' }));
});

describe('쓴 그대로 채워 두기', () => {
  it('별점·후기·사이즈·체형이 들어 있다', () => {
    render(<ReviewEditForm review={review()} />);

    expect(screen.getByRole('radio', { name: '4점' })).toBeChecked();
    expect(screen.getByLabelText(/후기/)).toHaveValue('두껍고 따뜻합니다. 기장도 알맞았어요.');
    expect(screen.getByLabelText('키 (cm)')).toHaveValue(175);
    expect(screen.getByLabelText('몸무게 (kg)')).toHaveValue(70);
  });

  it('적지 않았던 값은 비어 있다 — 없는 값을 지어내지 않는다', () => {
    render(<ReviewEditForm review={review({ sizeFit: null, height: null, weight: null })} />);
    expect(screen.getByLabelText('키 (cm)')).toHaveValue(null);
  });
});

describe('보내기', () => {
  it('고친 값을 PATCH 로 보내고 목록으로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('radio', { name: '2점' }));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/reviews/r-1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toMatchObject({ rating: 2 });

    /*
     * 결과는 목록 화면이 주소를 보고 말한다. 여기에 "저장했습니다" 를 띄우고 머물면 고친 글이 목록에 어떻게 보이는지는
     * 여전히 안 보인다.
     */
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/mypage/reviews?edited=1', { scroll: false }));
  });

  it('사진이 없던 글이면 사진 얘기를 꺼내지 않는다 — 서버가 손대지 않도록', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).not.toHaveProperty('keepImageIds');
  });

  it('열 자가 안 되면 보내지 못한다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.clear(screen.getByLabelText(/후기/));
    await user.type(screen.getByLabelText(/후기/), '별로');
    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('창구가 거절하면 그 이유를 그대로 말하고 머문다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ message: '자기 리뷰만 고칠 수 있습니다' }, { status: 403 }));
    render(<ReviewEditForm review={review()} />);
    await user.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('자기 리뷰만 고칠 수 있습니다');
    expect(replace).not.toHaveBeenCalled();
  });
});

describe('올린 사진', () => {
  const withPhotos = review({
    images: [
      { id: 'i-1', url: 'https://cdn/1.webp', blurDataUrl: null },
      { id: 'i-2', url: 'https://cdn/2.webp', blurDataUrl: null },
    ],
  });

  it('남길지 말지를 사진마다 고른다 — 처음에는 전부 남긴다', () => {
    render(<ReviewEditForm review={withPhotos} />);
    expect(screen.getByLabelText('사진 1 남기기')).toBeChecked();
    expect(screen.getByLabelText('사진 2 남기기')).toBeChecked();
  });

  it('뺀 사진만 빼고 남길 것을 보낸다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={withPhotos} />);

    await user.click(screen.getByLabelText('사진 1 남기기'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // 뺄 것이 아니라 남길 것을 보낸다 — 다른 탭에서 먼저 한 장을 뺐어도 엉뚱한 사진이 지워지지 않는다
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).keepImageIds).toEqual(['i-2']);
  });

  it('되돌리면 원래 차례로 돌아온다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={withPhotos} />);

    await user.click(screen.getByLabelText('사진 1 남기기'));
    await user.click(screen.getByLabelText('사진 1 남기기'));
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).keepImageIds).toEqual(['i-1', 'i-2']);
  });
});
