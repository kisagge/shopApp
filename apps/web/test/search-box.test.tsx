// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const push = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

const { SearchBox } = await import('~/components/search-box');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

const suggestions = [
  { kind: 'category', label: '코트', href: '/category/outer-coat' },
  { kind: 'brand', label: 'STUDIO NOON', href: '/search?q=STUDIO%20NOON' },
  { kind: 'product', label: '울 코트', href: '/product/wool-coat' },
];

const answer = (items: unknown[] = suggestions) =>
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ suggestions: items })));

beforeEach(() => {
  vi.clearAllMocks();
  answer();
  vi.stubGlobal('fetch', fetchMock);
});

const box = () => screen.getByRole('combobox');

/** 제안이 떠 있는 상태까지 간다 */
async function typeAndWait(text = '코트') {
  const user = userEvent.setup();
  render(<SearchBox id="q" />);
  await user.type(box(), text);
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(suggestions.length));
  return user;
}

describe('검색 자동완성 창', () => {
  it('한 글자에는 부르지 않는다', async () => {
    const user = userEvent.setup();
    render(<SearchBox id="q" />);
    await user.type(box(), '코');

    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(box()).toHaveAttribute('aria-expanded', 'false');
  });

  it('치는 도중의 글자마다 부르지 않는다 — 마지막 것만 부른다', async () => {
    const user = userEvent.setup();
    render(<SearchBox id="q" />);
    await user.type(box(), '오버사이즈');

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 300));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toContain(encodeURIComponent('오버사이즈'));
  });

  it('종류를 이름표로 말해 준다 — 고르면 어디로 가는지 알 수 있어야 한다', async () => {
    await typeAndWait();
    const [first, second, third] = screen.getAllByRole('option');

    expect(first).toHaveTextContent('카테고리');
    expect(second).toHaveTextContent('브랜드');
    expect(third).toHaveTextContent('상품');
  });

  it('몇 개가 떴는지 소리로도 알린다', async () => {
    await typeAndWait();
    expect(screen.getByRole('status')).toHaveTextContent('제안 3개');
  });

  it('없다는 것도 알린다 — 답이 온 뒤의 침묵은 기다리는 중과 구별되지 않는다', async () => {
    answer([]);
    const user = userEvent.setup();
    render(<SearchBox id="q" />);
    await user.type(box(), '없는말');

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('제안이 없습니다'));
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('초점은 입력칸에 두고 aria-activedescendant 로 가리킨다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowDown}');

    const options = screen.getAllByRole('option');
    expect(document.activeElement).toBe(box());
    expect(box()).toHaveAttribute('aria-activedescendant', options[0]!.id);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('아무것도 고르지 않은 채 위로 올리면 마지막으로 간다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowUp}');

    const options = screen.getAllByRole('option');
    expect(box()).toHaveAttribute('aria-activedescendant', options[2]!.id);
  });

  it('처음에서 위로 올리면 끝으로 돌아 감긴다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowDown}{ArrowUp}');

    const options = screen.getAllByRole('option');
    expect(box()).toHaveAttribute('aria-activedescendant', options[2]!.id);
  });

  it('끝에서 아래로 내리면 처음으로 돌아 감긴다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowUp}{ArrowDown}');

    const options = screen.getAllByRole('option');
    expect(box()).toHaveAttribute('aria-activedescendant', options[0]!.id);
  });

  it('같은 글자에 답이 다시 와도 고른 자리를 잃지 않는다', async () => {
    /*
     * CI 에서만 지던 실패가 이것이었다. 화살표를 누른 **직후에** 앞서 띄워
     * 둔 요청의 답이 도착하면 짚어 둔 자리가 풀려서, 사용자에게는 키가
     * 씹힌 것처럼 보인다. 답이 늦게 오는 상황을 그대로 만든다.
     */
    const user = await typeAndWait();

    let land = (_: unknown) => {};
    fetchMock.mockReturnValue(new Promise((resolve) => (land = resolve)));

    // 같은 글자를 다시 친다 — 목록은 그대로 떠 있고 요청만 새로 뜬다
    await user.clear(box());
    await user.type(box(), '코트');
    await new Promise((r) => setTimeout(r, 300));

    await user.keyboard('{ArrowDown}');
    const first = screen.getAllByRole('option')[0]!;
    expect(box()).toHaveAttribute('aria-activedescendant', first.id);

    // 이제서야 답이 도착한다
    land(new Response(JSON.stringify({ suggestions })));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    expect(box()).toHaveAttribute('aria-activedescendant', first.id);
    expect(screen.getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('다른 글자에 답이 오면 고른 자리를 되돌린다 — 번호가 옛 목록의 것이다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowDown}');

    await user.clear(box());
    await user.type(box(), '니트');
    await new Promise((r) => setTimeout(r, 300));

    expect(box()).not.toHaveAttribute('aria-activedescendant');
  });

  it('Escape 로 닫는다 — 친 글자는 지우지 않는다', async () => {
    const user = await typeAndWait();
    await user.keyboard('{Escape}');

    expect(box()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('listbox', { hidden: true })).toHaveProperty('hidden', true);
    expect(box()).toHaveProperty('value', '코트');
  });

  it('Enter 로 고른 곳으로 간다 — 검색 결과가 아니라 그 상품으로', async () => {
    const user = await typeAndWait();
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    await user.keyboard('{Enter}');

    expect(push).toHaveBeenCalledWith('/product/wool-coat');
  });

  it('아무것도 고르지 않고 Enter 를 치면 폼이 그대로 간다', async () => {
    const submit = vi.fn((e: Event) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={submit as never} action="/search">
        <SearchBox id="q" />
      </form>,
    );
    await user.type(box(), '코트');
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    await user.keyboard('{Enter}');

    expect(push).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalled();
  });

  it('눌러서 고를 수도 있다', async () => {
    const user = await typeAndWait();
    await user.click(screen.getAllByRole('option')[0]!);

    expect(push).toHaveBeenCalledWith('/category/outer-coat');
  });

  it('스크립트 없이도 검색되도록 이름은 q 로 둔다', async () => {
    render(<SearchBox id="q" />);
    expect(box()).toHaveProperty('name', 'q');
  });
});
