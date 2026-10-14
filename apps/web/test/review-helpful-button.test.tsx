// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ReviewHelpful } from '~/components/review-helpful';

/**
 * "도움돼요" **단추**.
 *
 * 창구 쪽 규칙(몇 번을 보내도 같은가, 센 값이 음수가 되지 않는가)은 `review-helpful.test.ts`
 * 가 본다. 여기서 보는 것은 **사람이 보는 쪽**이다 — 무엇으로 읽히고, 실패하면 무슨 말을 하는가.
 *
 * 검사가 한 줄도 없었고, **실패 자리에 단추 이름이 들어가 있었다.** `review.helpful` 은
 * '도움돼요' — 이 단추가 자기를 부르는 말이다. 그래서 보내기가 실패하면 '도움돼요' 라고
 * 적힌 단추 옆에 **빨간 글씨로 '도움돼요'** 가 떴다. 낭독기는 그것을 경고(role="alert")로
 * 읽는데, 무엇이 잘못됐는지도 다시 누르면 되는지도 말하지 않는다.
 *
 * 나머지는 생각이 잘 박혀 있다 — 숫자를 서버가 돌려준 값으로 맞추고(1을 더하면 그사이 남이
 * 누른 것을 놓쳐 새로고침마다 숫자가 튄다), 상태를 색이 아니라 이름으로 말한다.
 */

const props = {
  reviewId: 'r-1',
  initialCount: 3,
  initialPressed: false,
  canVote: true,
};

const open = (over: Partial<typeof props> = {}) => render(<ReviewHelpful {...props} {...over} />);
const button = () => screen.getByRole('button');

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ helpfulCount: 4 }));
});

/**
 * **누른 상태를 색이 아니라 이름으로 알린다.** 숫자만 따로 읽히면 그것이 무엇의 숫자인지
 * 알 수 없어서, 접근성 이름에 지금 몇 명인지까지 넣는다.
 */
describe('상태를 이름으로 말한다', () => {
  it('안 누른 상태', () => {
    open();

    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(button()).toHaveAccessibleName('도움됐다고 표시하기, 지금 3명');
  });

  it('누른 상태', () => {
    open({ initialPressed: true });

    expect(button()).toHaveAttribute('aria-pressed', 'true');
    expect(button()).toHaveAccessibleName('도움됐다고 표시함, 지금 3명');
  });

  /** 하트는 장식이다 — 이름과 상태는 단추가 말한다 */
  it('눈에 보이는 숫자는 낭독기에서 가린다 — 이름이 이미 말했다', () => {
    const { container } = open();

    const hidden = [...container.querySelectorAll('[aria-hidden="true"]')]
      .map((el) => el.textContent ?? '')
      .join(' ');
    expect(hidden, '눈에 보이는 숫자가 낭독기에도 그대로 읽히면 이름과 두 번 들린다').toContain('3');
  });
});

describe('누를 때', () => {
  it('처음 누르면 PUT 으로 보낸다', async () => {
    open();

    await userEvent.click(button());

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/reviews/r-1/helpful');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('누른 것을 다시 누르면 DELETE 로 보낸다', async () => {
    open({ initialPressed: true });

    await userEvent.click(button());

    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).method).toBe('DELETE');
  });

  /*
   * **숫자는 서버가 돌려준 값으로 맞춘다.** 눌린 상태에서 1을 더하면 그사이 다른 사람이 누른
   * 것을 놓쳐, 새로고침할 때마다 숫자가 튄다.
   */
  it('숫자를 1 더하지 않고 서버가 준 값으로 맞춘다', async () => {
    vi.stubGlobal('fetch', reply({ helpfulCount: 12 }));
    open({ initialCount: 3 });

    await userEvent.click(button());

    expect(await screen.findByRole('button', { name: /지금 12명/ })).toBeDefined();
  });

  it('누르고 나면 눌린 상태가 된다', async () => {
    open();

    await userEvent.click(button());

    await expect.poll(() => button().getAttribute('aria-pressed')).toBe('true');
  });

  /** 네이티브 disabled 라 브라우저가 두 번째 누름을 막는다 */
  it('보내는 동안 눌리지 않는다', async () => {
    let release!: () => void;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ helpfulCount: 4 }), { status: 200 }));
    }));
    vi.stubGlobal('fetch', fetchMock);
    open();

    await userEvent.click(button());
    expect(button()).toBeDisabled();
    await userEvent.click(button());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    release();
    await expect.poll(() => button().hasAttribute('disabled')).toBe(false);
  });
});

describe('못 보냈을 때', () => {
  /*
   * 여기가 고장이 있던 자리다. 단추 이름이 그대로 경고로 떴다.
   */
  it('단추 이름이 아니라 무엇이 잘못됐는지 말한다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();

    await userEvent.click(button());

    const said = await screen.findByRole('alert');
    expect(said).toHaveTextContent('도움돼요를 보내지 못했습니다.');
    expect(said.textContent, '단추 이름만 적혀 있으면 아무 말도 안 한 것이다').not.toBe('도움돼요');
  });

  it('서버가 말한 까닭이 있으면 그것을 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '자기 리뷰에는 누를 수 없습니다.' }, 403));
    open();

    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent('자기 리뷰에는 누를 수 없습니다.');
  });

  it('길이 끊겨도 무슨 말이든 한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(button());

    expect(await screen.findByRole('alert')).toHaveTextContent('도움돼요를 보내지 못했습니다.');
  });

  /** 못 보냈으면 눌린 것처럼 보이면 안 된다 — 다음에 누르면 DELETE 가 나간다 */
  it('못 보냈으면 상태와 숫자를 그대로 둔다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open({ initialCount: 3 });

    await userEvent.click(button());

    await screen.findByRole('alert');
    expect(button()).toHaveAttribute('aria-pressed', 'false');
    expect(button()).toHaveAccessibleName(/지금 3명/);
  });

  it('다시 눌러 성공하면 지난 경고를 치운다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();
    await userEvent.click(button());
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', reply({ helpfulCount: 4 }));
    await userEvent.click(button());

    await expect.poll(() => screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * **누를 수 없는 사람에게도 숫자는 보여 준다.** 이 표를 정렬 기준으로 쓰면서 그 수를 감추면,
 * 왜 이 리뷰가 위에 있는지 알 수 없다.
 */
describe('누를 수 없는 사람', () => {
  it('단추 대신 숫자만 선다', () => {
    open({ canVote: false, initialCount: 7 });

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/7/)).toBeDefined();
  });
});
