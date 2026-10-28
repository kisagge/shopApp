// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach } from 'vitest';
import { RecentSearches } from '~/components/recent-searches';
import { RecordRecentSearch } from '~/components/record-recent-search';
import { useRecentSearches } from '~/stores/recent-searches';
import { useRecentlyViewed } from '~/stores/recently-viewed';

/**
 * 최근 검색어 칩.
 *
 * **지우는 길이 이 조각의 뜻이다.** 검색어에는 사적인 것이 섞이기 쉬워서(증상·선물 받을 사람) 하나만 지우고
 * 나머지는 남기고 싶은 것이 자연스럽다 — 전부 지우기만 두면 그 사람은 전부 지우거나 전부 남긴다.
 *
 * 그리고 **지운 것이 눈으로만 보이면 안 된다.** 칩이 사라지는 변화는 낭독기로 듣는 사람에게 전해지지 않고,
 * 마지막 줄을 지우면 이 묶음이 통째로 사라지므로 더욱 그렇다.
 */

const terms = () => useRecentSearches.getState().terms;

beforeEach(() => {
  localStorage.clear();
  useRecentSearches.setState({ terms: [] });
  useRecentlyViewed.setState({ slugs: [] });
});

describe('찾은 것이 없으면', () => {
  it('아무것도 그리지 않는다 — 빈 상자에 "아직 없습니다" 를 띄우지 않는다', async () => {
    const { container } = render(<RecentSearches />);
    // 알림 자리만 남는다. 지운 것을 말하려면 늘 DOM 에 있어야 한다
    await waitFor(() => expect(screen.queryByRole('navigation')).toBeNull());
    expect(container.textContent).toBe('');
  });
});

describe('칩', () => {
  beforeEach(() => useRecentSearches.setState({ terms: ['울 코트', '니트', 'STUDIO NOON'] }));

  it('담은 차례대로 선다 — 방금 찾은 것이 앞이다', async () => {
    render(<RecentSearches />);
    const nav = await screen.findByRole('navigation', { name: '최근 검색어' });
    expect(within(nav).getAllByRole('link').map((a) => a.textContent)).toEqual([
      '울 코트',
      '니트',
      'STUDIO NOON',
    ]);
  });

  it('누르면 그 말로 검색한다', async () => {
    render(<RecentSearches />);
    const link = await screen.findByRole('link', { name: '울 코트' });
    expect(link).toHaveAttribute('href', '/search?q=%EC%9A%B8+%EC%BD%94%ED%8A%B8');
  });

  it('지우는 단추의 이름에 검색어가 들어간다', async () => {
    /*
     * "지우기" 가 여덟 개 있으면 낭독기로 듣는 사람은 어느 것을 지우는지 알 수 없다.
     */
    render(<RecentSearches />);
    expect(await screen.findByRole('button', { name: '최근 검색어에서 니트 지우기' })).toBeInTheDocument();
  });

  it('× 표시는 읽히지 않는다 — 이름은 단추가 말한다', async () => {
    const { container } = render(<RecentSearches />);
    await screen.findByRole('navigation');
    expect(container.querySelectorAll('span[aria-hidden="true"]')).toHaveLength(3);
  });

  it('검색 폼 안에 놓여도 보내지지 않게 단추의 종류를 밝힌다', async () => {
    /*
     * 폼 안의 단추는 기본이 submit 이다. 이 조각이 폼 안으로 옮겨지는 날 지우기를 누르면
     * 검색이 전송된다 — 기본값에 기대지 않는다.
     */
    render(<RecentSearches />);
    await screen.findByRole('navigation');
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveAttribute('type', 'button');
    }
  });
});

describe('한 줄만 지우기', () => {
  beforeEach(() => useRecentSearches.setState({ terms: ['울 코트', '니트'] }));

  it('고른 줄만 사라지고 나머지는 남는다', async () => {
    const user = userEvent.setup();
    render(<RecentSearches />);

    await user.click(await screen.findByRole('button', { name: '최근 검색어에서 니트 지우기' }));

    expect(terms()).toEqual(['울 코트']);
    expect(screen.getByRole('link', { name: '울 코트' })).toBeInTheDocument();
  });

  it('무엇을 지웠는지 말로 알린다', async () => {
    const user = userEvent.setup();
    render(<RecentSearches />);

    await user.click(await screen.findByRole('button', { name: '최근 검색어에서 니트 지우기' }));

    expect(screen.getByRole('status').textContent).toBe('니트을 최근 검색어에서 지웠습니다');
  });
});

describe('전부 지우기', () => {
  beforeEach(() => useRecentSearches.setState({ terms: ['울 코트', '니트'] }));

  it('한 번에 비운다', async () => {
    const user = userEvent.setup();
    render(<RecentSearches />);

    await user.click(await screen.findByRole('button', { name: '전체 지우기' }));

    expect(terms()).toEqual([]);
  });

  it('비웠다고 말로 알린다 — 묶음이 통째로 사라지는 것은 눈으로만 보인다', async () => {
    const user = userEvent.setup();
    render(<RecentSearches />);

    await user.click(await screen.findByRole('button', { name: '전체 지우기' }));

    expect(screen.getByRole('status').textContent).toBe('최근 검색어를 모두 지웠습니다');
    expect(screen.queryByRole('navigation')).toBeNull();
  });
});

describe('어디에 남는 기록인지 밝힌다', () => {
  it('기기에만 남는다고 적는다 — 검색 기록은 밝히지 않으면 불쾌하다', async () => {
    useRecentSearches.setState({ terms: ['코트'] });
    render(<RecentSearches />);
    expect(
      await screen.findByText('이 목록은 이 기기에만 남고 서버로 보내지 않습니다.'),
    ).toBeInTheDocument();
  });
});

describe('기기에 남는 자리', () => {
  it('최근 본 상품과 다른 열쇠로 담는다', async () => {
    /*
     * **메모리 상태만 보면 이것을 놓친다.** 두 스토어는 서로 다른 객체라 한쪽을 비워도 다른 쪽은
     * 멀쩡하다 — 그래서 저장 열쇠가 겹쳐도 그 검사는 통과한다. 겹치면 **다음에 열 때** 한쪽이
     * 다른 쪽을 덮어, 검색 기록을 지운 사람의 방문 기록까지 사라진다. 실제 저장소를 본다.
     */
    useRecentSearches.getState().record('코트');
    useRecentlyViewed.getState().record('wool-coat');

    await waitFor(() => {
      expect(localStorage.getItem('shop.recent-searches')).toContain('코트');
      expect(localStorage.getItem('shop.recently-viewed')).toContain('wool-coat');
    });
  });
});

describe('찾았다고 적는 조각', () => {
  it('그 말을 담고 화면에는 아무것도 그리지 않는다', async () => {
    const { container } = render(<RecordRecentSearch term="코트" />);

    await waitFor(() => expect(terms()).toEqual(['코트']));
    expect(container.innerHTML).toBe('');
  });

  it('검색어가 바뀌면 그것도 담는다', async () => {
    const { rerender } = render(<RecordRecentSearch term="코트" />);
    await waitFor(() => expect(terms()).toEqual(['코트']));

    rerender(<RecordRecentSearch term="니트" />);

    await waitFor(() => expect(terms()).toEqual(['니트', '코트']));
  });
});
