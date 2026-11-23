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

  it('사진을 붙여 들어온 적립금은 결과 문구까지 따라간다', async () => {
    // 말없이 들어오면 잔액이 왜 늘었는지 모른다. 결과를 말하는 곳은 목록 화면이다
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ id: 'r-1', earnedPoints: 400 }));
    render(<ReviewEditForm review={review()} />);
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/mypage/reviews?edited=1&earned=400', { scroll: false }),
    );
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

/**
 * **사진을 붙여 고치는 길.**
 *
 * 보내는 모양이 둘이다 — 새로 올릴 사진이 없으면 JSON, 있으면 multipart(작성
 * 창구와 같은 두 갈래다). 그런데 **여기서는 multipart 쪽이 한 번도 안 돌았다.**
 * 그 갈래가 깨지면 글은 고쳐지는데 사진만 안 올라가거나, 창구가 본문을 못 읽어
 * 통째로 거절한다 — 고친 사람은 무엇이 저장됐는지 알 수 없다.
 */
describe('사진을 붙여 고치면', () => {
  const photo = (name = 'new.webp') =>
    new File(['x'], name, { type: 'image/webp' });

  const bodyOf = () => fetchMock.mock.calls[0]![1].body as FormData;

  it('JSON 이 아니라 폼으로 보낸다 — 파일은 글자에 담을 수 없다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.upload(screen.getByLabelText(/사진/), photo());
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf()).toBeInstanceOf(FormData);
    expect(fetchMock.mock.calls[0]![1].headers).toBeUndefined();
  });

  it('고친 값은 data 칸에 그대로 싣는다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('radio', { name: '2점' }));
    await user.upload(screen.getByLabelText(/사진/), photo());
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(bodyOf().get('data') as string)).toMatchObject({ rating: 2 });
  });

  it('고른 사진을 모두 싣는다', async () => {
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.upload(screen.getByLabelText(/사진/), [photo('a.webp'), photo('b.webp')]);
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf().getAll('images')).toHaveLength(2);
  });

  it('남길 사진과 새 사진이 함께 간다 — 한쪽만 보내면 다른 쪽이 지워진다', async () => {
    const user = userEvent.setup();
    render(
      <ReviewEditForm
        review={review({ images: [{ id: 'i-1', url: 'https://cdn/1.webp', blurDataUrl: null }] })}
      />,
    );

    /* 사진이 있는 글에서는 올리는 칸의 이름이 "더 올리기" 로 바뀐다 */
    await user.upload(screen.getByLabelText(/더 올리기/), photo());
    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const data = JSON.parse(bodyOf().get('data') as string) as { keepImageIds: string[] };
    expect(data.keepImageIds).toEqual(['i-1']);
    expect(bodyOf().getAll('images')).toHaveLength(1);
  });
});

describe('끊기거나 모양이 틀리면', () => {
  /*
   * **고친 사람이 무슨 일이 있었는지는 알아야 한다.** 아무 말이 없으면 다시 누르고,
   * 그 사이 저장은 이미 되어 있을 수 있다.
   */
  it('창구에 닿지 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('거절이 JSON 이 아니어도 우리 문구로 말한다 — 502 가 HTML 을 주는 날이다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }));
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('button', { name: '저장' }));

    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('성공 응답의 본문이 비어도 목록으로 돌아간다 — 갈 곳은 응답에서 읽지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }));
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith('/mypage/reviews?edited=1', { scroll: false }),
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('실패한 뒤에도 다시 저장할 수 있다 — 잠긴 채로 두지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    render(<ReviewEditForm review={review()} />);

    await user.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '저장' })).toBeEnabled());
  });
});
