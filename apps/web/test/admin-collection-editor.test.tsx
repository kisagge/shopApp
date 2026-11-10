// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import type { CollectionItem } from '~/app/admin/collections/types';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { CollectionEditor } = await import('~/app/admin/collections/collection-editor');

/**
 * 기획전 편집기. **단위 검사가 한 줄도 없었다** — 60개 문장 전부가 안 돌았다.
 *
 * 창구 넷(추가·저장·상품 담기·삭제)을 한 `send` 로 모아 두었고, 그 안에서
 * **실패와 "본문이 없다" 를 가른다.** 삭제는 204 로 빈 몸통이 오는데 그걸 실패로
 * 보면 지운 줄이 화면에 남고, 반대로 실패를 성공으로 보면 안 지워진 줄이 사라진다.
 *
 * 끝난 말은 `sr-only` 라이브 영역에 둔다 — 눈으로는 목록이 바뀐 것이 보이지만
 * 낭독기에는 아무 일도 안 일어난 것과 같다.
 */

const ITEM: CollectionItem = {
  id: 'c-1',
  slug: 'winter-outer',
  title: '겨울 아웃터',
  subtitle: null,
  description: null,
  imageUrl: null,
  imageAlt: null,
  tone: 'sand',
  sortOrder: 0,
  isActive: false,
  startsAt: null,
  endsAt: null,
  status: 'SCHEDULED',
  itemCount: 0,
  products: [],
};

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const noContent = () => new Response(null, { status: 204 });

const call = (index = 0) => ({
  url: fetchMock.mock.calls[index]![0] as string,
  init: fetchMock.mock.calls[index]![1] as RequestInit,
});
const sent = (index = 0) => JSON.parse(call(index).init.body as string) as Record<string, unknown>;

/** 라이브 영역은 sr-only 라 역할로 찾는다 */
const live = () => document.querySelector('[aria-live="polite"]')!.textContent;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
});

describe('기획전 추가', () => {
  it('겹치지 않을 주소를 지어 보내고, 고치라고 말한다', async () => {
    fetchMock.mockResolvedValue(json(201, { ...ITEM, id: 'c-2', title: '새 기획전' }));
    render(<CollectionEditor initial={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '기획전 추가' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(call().url).toBe('/api/admin/collections');
    expect(call().init.method).toBe('POST');
    expect(sent()).toMatchObject({ title: '새 기획전', isActive: false, tone: 'sand' });
    expect(sent().slug).toMatch(/^collection-[0-9a-z]+$/);
    expect(live()).toBe('기획전을 추가했습니다. 상품을 담고 주소를 정한 뒤 노출을 켜 주세요.');
  });

  it('더한 기획전이 목록에 바로 들어간다 — 비어 있다는 말이 사라진다', async () => {
    fetchMock.mockResolvedValue(json(201, { ...ITEM, id: 'c-2', title: '새 기획전' }));
    render(<CollectionEditor initial={[]} />);
    expect(screen.getByText(/기획전이 없습니다/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '기획전 추가' }));

    await waitFor(() => expect(screen.queryByText(/기획전이 없습니다/)).toBeNull());
    expect(screen.getByRole('listitem')).toBeInTheDocument();
  });

  it('실패하면 목록을 건드리지 않고 까닭을 띄운다', async () => {
    fetchMock.mockResolvedValue(json(403, { message: '권한이 없습니다.' }));
    render(<CollectionEditor initial={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '기획전 추가' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('권한이 없습니다.'));
    expect(screen.getByText(/기획전이 없습니다/)).toBeInTheDocument();
    expect(refresh).not.toHaveBeenCalled();
    expect(live()).toBe('');
  });

  it('창구가 까닭을 글로 안 적어 보내도 우리 문구로 바꿔 띄운다', async () => {
    /*
     * `message` 가 글자가 아닐 수 있다. 그대로 그리면 리액트가 넘어지거나
     * `[object Object]` 가 손님에게 보인다 — 그래서 글자인지 보고 쓴다.
     */
    fetchMock.mockResolvedValue(json(500, { message: { ko: '안 됩니다' } }));
    render(<CollectionEditor initial={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '기획전 추가' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
  });

  it('창구에 닿지도 못하면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<CollectionEditor initial={[]} />);
    await userEvent.click(screen.getByRole('button', { name: '기획전 추가' }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('네트워크 오류로 처리하지 못했습니다.'),
    );
  });

  it('보내는 동안 추가 단추가 잠긴다 — 두 번 누르면 기획전이 둘 생긴다', async () => {
    let give!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { give = resolve; }));
    render(<CollectionEditor initial={[]} />);
    const add = screen.getByRole('button', { name: '기획전 추가' });
    await userEvent.click(add);

    await waitFor(() => expect(add).toBeDisabled());
    await act(async () => {
      give(json(201, { ...ITEM, id: 'c-2' }));
    });
  });
});

describe('노출 켜기 — 저장', () => {
  it('바꾼 값만 보내고 창구가 돌려준 값으로 줄을 갈아 끼운다', async () => {
    fetchMock.mockResolvedValue(json(200, { ...ITEM, isActive: true, status: 'LIVE' }));
    render(<CollectionEditor initial={[ITEM]} />);
    await userEvent.click(screen.getByRole('button', { name: '노출 시작' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(call().url).toBe('/api/admin/collections/c-1');
    expect(call().init.method).toBe('PATCH');
    expect(sent()).toEqual({ isActive: true });
    expect(screen.getByRole('button', { name: '노출 중지' })).toBeInTheDocument();
    expect(live()).toBe('저장했습니다.');
  });

  it('실패하면 줄이 그대로다 — 켜지지도 않았는데 켜진 것처럼 보이면 안 된다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '담긴 상품이 없습니다.' }));
    render(<CollectionEditor initial={[ITEM]} />);
    await userEvent.click(screen.getByRole('button', { name: '노출 시작' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('담긴 상품이 없습니다.'));
    expect(screen.getByRole('button', { name: '노출 시작' })).toBeInTheDocument();
    expect(live()).toBe('');
  });
});

describe('삭제', () => {
  const remove = async () => {
    render(<CollectionEditor initial={[ITEM]} />);
    await userEvent.click(screen.getByRole('button', { name: '겨울 아웃터 기획전 삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '겨울 아웃터 기획전 삭제 확인' }));
  };

  it('빈 몸통(204)을 실패로 보지 않는다 — 지운 줄이 화면에 남으면 안 된다', async () => {
    fetchMock.mockResolvedValue(noContent());
    await remove();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
    expect(call().init.method).toBe('DELETE');
    expect(screen.getByText(/기획전이 없습니다/)).toBeInTheDocument();
    expect(live()).toBe('기획전을 삭제했습니다.');
  });

  it('실패하면 줄이 남고 까닭이 뜬다', async () => {
    fetchMock.mockResolvedValue(json(409, { message: '노출 중인 기획전입니다.' }));
    await remove();

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe('노출 중인 기획전입니다.'),
    );
    expect(screen.getByRole('listitem')).toBeInTheDocument();
    expect(live()).toBe('');
  });

  it('지우기 전에 한 번 묻는다', async () => {
    fetchMock.mockResolvedValue(noContent());
    render(<CollectionEditor initial={[ITEM]} />);
    await userEvent.click(screen.getByRole('button', { name: '겨울 아웃터 기획전 삭제' }));

    expect(screen.getByText('지울까요?')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
