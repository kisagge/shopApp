// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const replace = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }));

const { ReviewForm } = await import('~/app/(shop)/mypage/reviews/review-form');

/**
 * 후기 **처음 쓰기** 폼.
 *
 * 고치는 폼에는 검사가 있었는데 쓰는 폼에는 없었다 — 칸은 함께 쓰지만(`review-fields`) 여기 남은 것은
 * **처음 쓸 때만의 일**이다: 어느 구매의 후기인지 싣는 것, 사진 유무로 보내는 모양이 갈리는 것,
 * 등록하고 나서 폼을 거두는 것. 그 셋이 고치기 쪽과 다르므로 **쓰기에서만 깨질 수 있다.**
 *
 * **사진이 없으면 JSON 그대로 보낸다.** 사진 없는 후기가 대부분인데 그쪽까지 multipart 로 바꾸면 이유
 * 없이 무거워진다 — 두 길이 있다는 것은 두 길이 각자 틀릴 수 있다는 뜻이다.
 */

const target = {
  orderItemId: 'oi-1',
  productName: '울 코트',
  brandName: 'MOOR',
  optionLabel: '오트 / M',
  imageUrl: null,
};

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ id: 'r-1' }, { status: 201 }));
});

const open = () => {
  const user = userEvent.setup();
  render(<ReviewForm target={target} />);
  return user;
};

const post = () => screen.getByRole('button', { name: '리뷰 등록' });
const fill = async (user: ReturnType<typeof userEvent.setup>, content = '두껍고 따뜻합니다. 좋아요.') => {
  await user.click(screen.getByRole('radio', { name: '5점' }));
  await user.type(screen.getByRole('textbox'), content);
};

describe('빈 폼으로 시작한다', () => {
  it('아무것도 안 고른 채로는 보낼 수 없다', () => {
    open();

    expect(post()).toBeDisabled();
  });

  it('별점만 골라도 아직 못 보낸다 — 글이 없으면 후기가 아니다', async () => {
    const user = open();

    await user.click(screen.getByRole('radio', { name: '4점' }));

    expect(post()).toBeDisabled();
  });

  /** 열 자가 경계다 — 아홉 자에서 막고 열 자에서 열린다 */
  it('아홉 자로는 못 보내고 열 자가 되면 보낼 수 있다', async () => {
    const user = open();
    await user.click(screen.getByRole('radio', { name: '5점' }));

    await user.type(screen.getByRole('textbox'), '123456789');
    expect(post()).toBeDisabled();

    await user.type(screen.getByRole('textbox'), '0');
    expect(post()).toBeEnabled();
  });

  /** 공백으로 열 자를 채운 글은 후기가 아니다 — 다듬은 뒤 길이로 센다 */
  it('공백으로 열 자를 채워도 못 보낸다', async () => {
    const user = open();
    await user.click(screen.getByRole('radio', { name: '5점' }));

    await user.type(screen.getByRole('textbox'), '짧다        ');

    expect(post()).toBeDisabled();
  });
});

describe('사진이 없으면 JSON 으로', () => {
  it('어느 구매의 후기인지 싣는다', async () => {
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers?: Record<string, string>; body: string }];
    expect(url).toBe('/api/reviews');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toMatchObject({ orderItemId: 'oi-1', rating: 5 });
  });

  it('content-type 을 JSON 으로 적는다', async () => {
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  /** 안 적은 값은 null 이다 — 빈 글자로 보내면 서버가 "0cm 인 사람" 을 받는다 */
  it('적지 않은 사이즈·키·몸무게는 null 로 보낸다', async () => {
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ sizeFit: null, height: null, weight: null });
  });

  it('적은 키·몸무게는 숫자로 보낸다 — 글자로 보내면 서버가 거절한다', async () => {
    const user = open();
    await fill(user);
    await user.type(screen.getByLabelText('키 (cm)'), '175');
    await user.type(screen.getByLabelText('몸무게 (kg)'), '70');

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body)).toMatchObject({ height: 175, weight: 70 });
  });
});

describe('사진이 있으면 multipart 로', () => {
  const photo = (name = 'a.webp') => new File(['x'], name, { type: 'image/webp' });

  it('데이터는 한 칸에, 사진은 따로 담는다', async () => {
    const user = open();
    await fill(user);
    await user.upload(screen.getByLabelText(/사진/), photo());

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    const body = init.body;
    expect(body).toBeInstanceOf(FormData);
    const data = body.get('data');
    expect(typeof data).toBe('string');
    expect(JSON.parse(data as string)).toMatchObject({ orderItemId: 'oi-1', rating: 5 });
    expect(body.getAll('images')).toHaveLength(1);
  });

  /** 사진이 있으면 content-type 을 적지 않는다 — 적으면 경계 문자열이 빠져 서버가 못 읽는다 */
  it('content-type 을 손으로 적지 않는다', async () => {
    const user = open();
    await fill(user);
    await user.upload(screen.getByLabelText(/사진/), photo());

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { headers?: unknown }];
    expect(init.headers).toBeUndefined();
  });

  it('여러 장이면 그만큼 담는다', async () => {
    const user = open();
    await fill(user);
    await user.upload(screen.getByLabelText(/사진/), [photo('a.webp'), photo('b.webp')]);

    await user.click(post());

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as [string, { body: FormData }];
    expect(init.body.getAll('images')).toHaveLength(2);
  });
});

/**
 * **결과를 주소에 싣고 화면을 다시 받는다.** 새로 고치기만 하면 방금 쓴 상품이 목록에서 빠지면서 이
 * 폼과 함께 "등록했습니다" 가 곧바로 사라진다 — 마지막 한 개였으면 "쓸 수 있는 상품이 없습니다" 만
 * 남아 등록이 된 건지 모른다. 낭독기는 읽기도 전에 사라진 알림을 말하지 않는다.
 */
describe('등록한 뒤', () => {
  it('결과를 주소에 싣고 돌아간다', async () => {
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/mypage/reviews?saved=1', { scroll: false }));
  });

  /** 말없이 들어오면 잔액이 왜 늘었는지 모른다 */
  it('적립금이 들어오면 그 수도 함께 싣는다', async () => {
    fetchMock.mockResolvedValue(Response.json({ id: 'r-1', earnedPoints: 500 }, { status: 201 }));
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/mypage/reviews?saved=1&earned=500', { scroll: false }));
  });

  /** 폼과 화면이 둘 다 말하면 낭독기가 두 번 읽는다 — 말은 화면이 한 번만 한다 */
  it('폼을 거둔다', async () => {
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(screen.queryByRole('button', { name: '리뷰 등록' })).toBeNull());
  });
});

describe('실패했을 때', () => {
  it('창구가 거절하면 그 까닭을 그대로 말하고 머문다', async () => {
    fetchMock.mockResolvedValue(Response.json({ code: 'ALREADY_REVIEWED', message: '이미 후기를 쓴 주문입니다.' }, { status: 409 }));
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('이미 후기를 쓴 주문입니다.'));
    // 폼이 남아 있어야 고쳐서 다시 보낼 수 있다
    expect(post()).toBeDefined();
  });

  it('까닭을 안 주면 기본 문구를 쓴다', async () => {
    fetchMock.mockResolvedValue(Response.json({}, { status: 500 }));
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('리뷰를 저장하지 못했습니다.'));
  });

  it('네트워크가 끊기면 그렇게 말한다 — 서버가 거절한 것과 다른 일이다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(screen.getByRole('alert')).toBeDefined());
    expect(replace).not.toHaveBeenCalled();
  });

  /** 두 번 눌러 후기가 둘이 되면 적립금도 두 번이다 */
  it('보내는 동안 다시 누를 수 없다', async () => {
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { release = resolve; }));
    const user = open();
    await fill(user);

    await user.click(post());

    await waitFor(() => expect(screen.getByRole('button', { name: '등록 중…' })).toBeDisabled());
    release(Response.json({ id: 'r-1' }, { status: 201 }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
