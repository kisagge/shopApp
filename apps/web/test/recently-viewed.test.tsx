// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { won } from '@shop/core';
import { render, screen, waitFor, within } from './render';
import userEvent from '@testing-library/user-event';
import { useRecentlyViewed } from '~/stores/recently-viewed';
import type { ProductListItem } from '~/lib/queries/catalog/shelf';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));

const { RecentlyViewed } = await import('~/components/recently-viewed');

/**
 * 최근 본 상품 줄. **문장 29개 전부가 안 돌았다.**
 *
 * 그릴지 말지를 세 가지가 함께 정한다 — 붙었는지(localStorage 는 서버에 없다),
 * 들고 있는 slug 가 있는지, 그리고 **창구가 돌려준 상품이 있는지**. 셋째가
 * 있어야 하는 까닭: 본 상품이 전부 내려가면 제목과 "전체 삭제" 만 남은 빈
 * 줄이 된다.
 *
 * 그리고 **지우면 이 줄이 통째로 사라지는데 사라지는 것은 눈으로만 보인다** —
 * 낭독기에게는 단추를 눌렀는데 아무 일도 안 일어난 것과 같아서 말로 알린다.
 * 알림 자리를 늘 DOM 에 두는 것도 그 때문이다(만들어 넣으면 놓치는 경우가 있다).
 */

const item = (slug: string, over: Partial<ProductListItem> = {}): ProductListItem => ({
  id: `p-${slug}`,
  slug,
  brand: '무어',
  categorySlug: 'outer',
  name: `${slug} 코트`,
  price: won(128_000),
  listPrice: undefined,
  discountPercent: undefined,
  rating: undefined,
  reviewCount: 0,
  soldOut: false,
  isNew: false,
  imageUrl: undefined,
  imageAlt: undefined,
  blurDataUrl: undefined,
  ...over,
});

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

/** 창구가 받은 slug 목록 */
const askedFor = () => new URL(fetchMock.mock.calls[0]![0] as string, 'http://x').searchParams.get('slugs');

/** 이 줄의 제목. 상품 칸에도 제목(h3)이 있어 이름으로 좁힌다 */
const heading = (query = false) =>
  query
    ? screen.queryByRole('heading', { name: '최근 본 상품' })
    : screen.getByRole('heading', { name: '최근 본 상품' });
const section = () => screen.getByRole('region', { name: '최근 본 상품' });

const show = async (props: { excludeSlug?: string } = {}) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    ...render(
      <QueryClientProvider client={client}>
        <RecentlyViewed {...props} />
      </QueryClientProvider>,
    ),
    /**
     * 질의가 끝날 때까지 기다린다.
     *
     * **"창구를 불렀다" 로 기다리면 너무 이르다** — 부른 직후에는 아직 아무것도
     * 안 그려져 있어서, 그리면 안 되는 것을 그리는 고장도 통과한다. 여기서 한 번
     * 그렇게 헛돌았다.
     */
    settled: async () => {
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      await waitFor(() => expect(client.isFetching()).toBe(0));
    },
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  useRecentlyViewed.setState({ slugs: [] });
  fetchMock.mockImplementation(async (url: string) => {
    const slugs = new URL(url, 'http://x').searchParams.get('slugs')!.split(',');
    return json(200, { products: slugs.map((s) => item(s)) });
  });
});

describe('그릴지 말지', () => {
  it('본 것이 없으면 아무것도 묻지 않고 줄도 없다', async () => {
    await show();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(heading(true)).toBeNull();
  });

  it('본 것이 있으면 그 상품들로 줄을 만든다', async () => {
    useRecentlyViewed.setState({ slugs: ['coat', 'knit'] });
    await show();

    await waitFor(() => expect(heading()).toBeInTheDocument());
    const row = within(section()).getByRole('list');
    expect(within(row).getAllByRole('listitem')).toHaveLength(2);
    expect(askedFor()).toBe('coat,knit');
  });

  it('전부 내려간 상품이면 그리지 않는다 — 제목만 남은 빈 줄을 만들지 않는다', async () => {
    fetchMock.mockResolvedValue(json(200, { products: [] }));
    useRecentlyViewed.setState({ slugs: ['gone'] });
    const { settled } = await show();
    await settled();

    expect(heading(true)).toBeNull();
    expect(screen.queryByRole('region', { name: '최근 본 상품' })).toBeNull();
  });

  it('창구가 넘어져도 줄만 없고 화면은 멀쩡하다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    useRecentlyViewed.setState({ slugs: ['coat'] });
    const { settled } = await show();
    await settled();

    expect(heading(true)).toBeNull();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('실패한 응답의 몸통은 쓰지 않는다 — 500 에 상품이 실려 와도 그리지 않는다', async () => {
    /*
     * 상태를 안 보고 몸통만 읽으면, 넘어진 응답이나 캐시가 끼워 넣은 옛 몸통을
     * 그대로 화면에 올린다. 몸통이 멀쩡해 보일 때가 가장 위험하다 — 그래서
     * 여기서는 **그려 볼 수 있는 몸통**을 실어 보낸다.
     */
    fetchMock.mockResolvedValue(json(500, { products: [item('coat')] }));
    useRecentlyViewed.setState({ slugs: ['coat'] });
    const { settled } = await show();
    await settled();

    expect(heading(true)).toBeNull();
  });

  it('보고 있는 상품은 빼고 묻는다 — 지금 보는 것을 "최근 본" 에 또 둘 이유가 없다', async () => {
    useRecentlyViewed.setState({ slugs: ['coat', 'knit'] });
    await show({ excludeSlug: 'coat' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(askedFor()).toBe('knit');
  });

  it('보고 있는 상품 하나만 들고 있으면 아예 묻지 않는다', async () => {
    useRecentlyViewed.setState({ slugs: ['coat'] });
    await show({ excludeSlug: 'coat' });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(heading(true)).toBeNull();
  });

  it('들고 있는 것이 많아도 여덟까지만 묻는다 — 가로 줄 하나에 담을 만큼', async () => {
    const many = Array.from({ length: 12 }, (_, i) => `p${i}`);
    useRecentlyViewed.setState({ slugs: many });
    await show();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(askedFor()!.split(',')).toHaveLength(8);
    expect(askedFor()).toBe(many.slice(0, 8).join(','));
  });
});

describe('기록 지우기', () => {
  const open = async () => {
    useRecentlyViewed.setState({ slugs: ['coat', 'knit'] });
    await show();
    await waitFor(() => expect(heading()).toBeInTheDocument());
  };

  it('알림 자리는 처음부터 DOM 에 있고 비어 있다', async () => {
    await show();

    const status = screen.getByRole('status');
    expect(status).toBeInTheDocument();
    expect(status).toBeEmptyDOMElement();
  });

  it('지우면 줄이 사라지고, 사라진 것을 말로 알린다', async () => {
    await open();
    await userEvent.click(screen.getByRole('button', { name: '기록 지우기' }));

    expect(heading(true)).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('최근 본 상품을 지웠습니다');
    expect(useRecentlyViewed.getState().slugs).toEqual([]);
  });

  it('어디에 남는 기록인지 밝힌다 — 방문 기록은 밝히지 않으면 불쾌한 종류다', async () => {
    await open();

    expect(screen.getByText(/이 기기에만/)).toBeInTheDocument();
  });

  it('제목과 줄이 이름으로 묶여 있다', async () => {
    await open();

    expect(within(section()).getByRole('heading', { name: '최근 본 상품' })).toBeInTheDocument();
  });
});
