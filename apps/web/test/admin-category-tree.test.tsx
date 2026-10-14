// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CategoryTree, type CategoryNodeView } from '~/app/admin/categories/category-tree';

/**
 * 카테고리 나무 — **매대의 생김새를 정하는 화면.**
 *
 * 컴포넌트 검사가 한 줄도 없었다(`manage-category.test.ts` 는 창구 쪽이다). 고장은 없었다 —
 * 이 파일은 머리말에 적은 규칙을 코드가 그대로 지킨다. 그래서 **그 규칙들을 못 박는다.**
 *
 * 화면이 규칙을 미리 말하는 것이 요점이다. 서버도 같은 것을 막지만(core 의
 * `categoryPlacementProblem`), **눌러 보고 나서 알게 하지 않는다** — 그 안내가 사라지면
 * 운영자는 만들어 보고 거절당한 뒤에야 알게 되고, 검사는 조용히 통과한다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const node = (over: Partial<CategoryNodeView> & { id: string; name: string }): CategoryNodeView => ({
  slug: over.id,
  productCount: 0,
  deletable: true,
  children: [],
  ...over,
});

const TREE: CategoryNodeView[] = [
  node({ id: 'outer', name: '아우터', children: [
    node({ id: 'coat', name: '코트' }),
    node({ id: 'blouson', name: '블루종' }),
  ], deletable: false }),
  node({ id: 'knit', name: '니트' }),
];

const open = (tree: CategoryNodeView[] = TREE) => render(<CategoryTree tree={tree} />);

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const fails = (message: string, status = 409) =>
  vi.fn(async () => new Response(JSON.stringify({ message }), { status }));

const bodyOf = (call = 0) =>
  JSON.parse((vi.mocked(fetch).mock.calls[call]![1] as RequestInit).body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', ok());
});

/**
 * **순서는 단추로 옮긴다.** 끌어다 놓기는 키보드와 낭독기에게 거의 닫힌 길이고, 갈래가
 * 열 몇 개뿐이라 위·아래로 충분하다.
 */
describe('순서 바꾸기', () => {
  const up = (name: string) => screen.getByRole('button', { name: `${name} 위로` });
  const down = (name: string) => screen.getByRole('button', { name: `${name} 아래로` });

  it('내린 뒤의 차례를 통째로 보낸다 — 서버는 그 부모의 자식 전부를 받는다', async () => {
    open();

    await userEvent.click(down('아우터'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(bodyOf()).toEqual({ parentId: null, orderedIds: ['knit', 'outer'] });
  });

  it('하위 갈래는 그 부모 안에서만 움직인다', async () => {
    open();

    await userEvent.click(down('코트'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(bodyOf()).toEqual({ parentId: 'outer', orderedIds: ['blouson', 'coat'] });
  });

  /*
   * **끝에서는 눌리지 않는다.** 맨 위에서 '위로' 가 눌리면 `splice(-1, 0, …)` 이 되어 엉뚱한
   * 자리로 끼워 넣는다 — 화면에는 아무 말도 없이 차례만 뒤집힌다. 브라우저가 막게 둔다.
   */
  it('맨 위는 더 올릴 수 없고 맨 아래는 더 내릴 수 없다', () => {
    open();

    expect(up('아우터')).toBeDisabled();
    expect(down('니트')).toBeDisabled();
    expect(down('아우터')).toBeEnabled();
    expect(up('니트')).toBeEnabled();
  });

  it('하위 갈래도 끝에서 막힌다', () => {
    open();

    expect(up('코트')).toBeDisabled();
    expect(down('블루종')).toBeDisabled();
  });

  /** 하나를 보내는 동안 나무 전체가 잠긴다 — 반쯤 보낸 차례 위에 또 보내면 어긋난다 */
  it('보내는 동안 다른 단추도 함께 잠긴다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await userEvent.click(down('아우터'));

    expect(up('니트')).toBeDisabled();
    expect(down('코트')).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

/**
 * **화면이 규칙을 미리 말한다.** 서버도 막지만, 눌러 보고 나서 알게 하지 않는다.
 */
describe('만들 수 있는 자리', () => {
  it('최상위 갈래는 언제나 더할 수 있다', () => {
    open();

    expect(screen.getByRole('button', { name: '최상위 갈래 추가' })).toBeDefined();
  });

  it('빈 갈래 밑에는 하위 갈래를 더할 수 있다', () => {
    open([node({ id: 'knit', name: '니트' })]);

    expect(screen.getByRole('button', { name: '니트 아래 갈래 추가' })).toBeDefined();
  });

  /*
   * 상품은 아래 갈래가 없는 곳에만 붙는다. 밑에 자식을 넣으면 그 상품들이 어느 쪽으로 세어도
   * 빠진다 — 그래서 단추를 감추고 **무엇을 먼저 해야 하는지** 적는다.
   */
  it('상품이 붙은 갈래 밑에는 못 만든다 — 까닭과 할 일을 적는다', () => {
    open([node({ id: 'knit', name: '니트', productCount: 12 })]);

    expect(screen.queryByRole('button', { name: '니트 아래 갈래 추가' })).toBeNull();
    expect(screen.getByText(/상품이 붙어 있어 하위 갈래를 만들 수 없습니다/)).toBeDefined();
    expect(screen.getByText(/상품을 먼저 옮겨 주세요/)).toBeDefined();
  });

  /** 두 단까지다 — 하위 갈래 줄에는 "그 아래" 가 아예 없다 */
  it('하위 갈래 밑에는 더 만들 자리가 없다', () => {
    open();

    expect(screen.queryByRole('button', { name: /코트 아래 갈래 추가/ })).toBeNull();
  });
});

describe('갈래 만들기', () => {
  const fill = async (label: string) => {
    await userEvent.click(screen.getByRole('button', { name: label }));
    const form = screen.getByRole('form', { name: label });
    await userEvent.type(within(form).getByLabelText('이름'), '머플러');
    await userEvent.type(within(form).getByLabelText(/^주소/), 'muffler');
    return form;
  };

  it('이름·주소·부모를 함께 보낸다', async () => {
    open();

    const form = await fill('니트 아래 갈래 추가');
    await userEvent.click(within(form).getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(bodyOf()).toEqual({ name: '머플러', slug: 'muffler', parentId: 'knit' });
  });

  it('최상위는 부모 없이 보낸다', async () => {
    open();

    const form = await fill('최상위 갈래 추가');
    await userEvent.click(within(form).getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(bodyOf()['parentId']).toBeNull();
  });

  it('만들어지면 폼을 닫는다', async () => {
    open();

    const form = await fill('최상위 갈래 추가');
    await userEvent.click(within(form).getByRole('button', { name: '만들기' }));

    await waitFor(() => expect(screen.queryByRole('form', { name: '최상위 갈래 추가' })).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  /** 못 만들었으면 적은 것을 지우지 않는다 — 주소 하나 때문에 다시 치게 할 수 없다 */
  it('못 만들었으면 폼을 열어 둔 채 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', fails('이미 쓰는 주소입니다.'));
    open();

    const form = await fill('최상위 갈래 추가');
    await userEvent.click(within(form).getByRole('button', { name: '만들기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 쓰는 주소입니다.');
    expect(within(form).getByLabelText('이름')).toHaveValue('머플러');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 주소는 소문자·숫자·붙임표만 — 서버까지 가기 전에 브라우저가 막는다 */
  it('주소 칸이 쓸 수 있는 모양을 스스로 말한다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '최상위 갈래 추가' }));
    const slug = within(screen.getByRole('form', { name: '최상위 갈래 추가' })).getByLabelText(/^주소/);

    expect(slug).toHaveAttribute('pattern', '[a-z0-9]+(-[a-z0-9]+)*');
    expect(slug).toBeRequired();
  });
});

/**
 * **지우기는 되돌릴 수 없다.** 한 번 더 묻고, 지울 수 없는 갈래에는 단추를 아예 두지 않는다.
 */
describe('지우기', () => {
  it('비어 있지 않으면 단추 대신 까닭이 선다', () => {
    open();

    expect(screen.queryByRole('button', { name: '아우터 지우기' })).toBeNull();
    expect(screen.getByText(/상품이나 하위 갈래가 있어 지울 수 없습니다/)).toBeDefined();
  });

  it('바로 지우지 않고 묻는다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '니트 지우기' }));

    expect(screen.getByText('지울까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 지운다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '니트 지우기' }));
    await userEvent.click(screen.getByRole('button', { name: '지웁니다' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/admin/categories/knit',
      expect.objectContaining({ method: 'DELETE' }),
    ));
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '니트 지우기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '니트 지우기' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('못 지웠으면 까닭을 말하고 묻는 자리에 그대로 둔다', async () => {
    vi.stubGlobal('fetch', fails('상품이 남아 있습니다.'));
    open();

    await userEvent.click(screen.getByRole('button', { name: '니트 지우기' }));
    await userEvent.click(screen.getByRole('button', { name: '지웁니다' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('상품이 남아 있습니다.');
    expect(screen.getByRole('button', { name: '지웁니다' })).toBeDefined();
  });
});

describe('이름·주소 고치기', () => {
  it('바꾼 것이 없으면 저장할 수 없다', () => {
    open([node({ id: 'knit', name: '니트' })]);

    expect(screen.getByRole('button', { name: '저장' })).toBeDisabled();
  });

  it('바꾸면 저장할 수 있고, 바꾼 값을 보낸다', async () => {
    open([node({ id: 'knit', name: '니트' })]);

    const name = screen.getByLabelText('니트 이름');
    await userEvent.clear(name);
    await userEvent.type(name, '니트웨어');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(bodyOf()).toEqual({ name: '니트웨어', slug: 'knit' });
  });

  /** 주소를 바꾸면 옛 주소로 들어온 사람이 어디로 가는지 미리 말한다 */
  it('주소를 바꾸면 옛 주소가 어떻게 되는지 알린다', async () => {
    open([node({ id: 'knit', name: '니트' })]);

    const slug = screen.getByLabelText('니트 주소');
    await userEvent.clear(slug);
    await userEvent.type(slug, 'knitwear');

    expect(screen.getByRole('status')).toHaveTextContent('/category/knit');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open([node({ id: 'knit', name: '니트' })]);

    const name = screen.getByLabelText('니트 이름');
    await userEvent.type(name, '웨어');
    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
