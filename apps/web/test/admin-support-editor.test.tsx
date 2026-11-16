// @vitest-environment jsdom
import { act, render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import type { SupportPostItem } from '~/app/admin/support/support-editor';

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
// 편집기는 따로 받아 오는 무거운 조각이다 — 여기서 보는 것은 그 바깥이다
vi.mock('~/app/admin/support/rich-editor', () => ({
  /*
   * 편집기는 따로 받아 오는 무거운 조각이다 — 여기서 보는 것은 그 바깥이다.
   * 다만 **바꾼 나무가 그대로 실려 가는지**는 봐야 하므로, 흉내가 지금 값을
   * 적어 두고 바꿀 길 하나를 낸다.
   */
  RichEditor: ({ value, onChange }: {
    value: unknown;
    onChange: (doc: unknown) => void;
  }) => (
    <div>
      <span data-testid="body-doc">{JSON.stringify(value)}</span>
      <button
        type="button"
        onClick={() => onChange({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '고친 본문' }] }] })}
      >
        본문 고치기
      </button>
    </div>
  ),
}));

const { SupportEditor } = await import('~/app/admin/support/support-editor');

/**
 * 공지·FAQ 편집 — **손님이 읽는 글을 올리고 내리는 자리.**
 *
 * 컴포넌트 검사가 한 줄도 없었다(`support.test.ts` 는 창구 쪽이다). 둘이 있었다.
 *
 * **하나, 내리기를 `window.confirm` 으로 묻고 있었다.** 묻기는 묻지만, 브라우저가 "이 페이지가
 * 추가 대화상자를 만들지 못하게 차단" 을 띄우고 운영자가 한 번 누르면 **그 뒤로는 조용히
 * false 를 돌려준다** — 단추가 아무 일도 안 하게 되고 까닭은 어디에도 없다.
 *
 * **둘, 목록 단추가 어느 글의 것인지 말하지 않았다.** 글이 스물이면 낭독기에는 "수정" 이
 * 스무 번 들린다.
 */

const post = (over: Partial<SupportPostItem> & { id: string; title: string }): SupportPostItem => ({
  kind: 'NOTICE',
  topic: null,
  pinned: false,
  sortOrder: 0,
  publishedAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  authorName: '운영자',
  ...over,
});

const POSTS: SupportPostItem[] = [
  post({ id: 's-1', title: '추석 배송 안내' }),
  post({ id: 's-2', title: '교환은 어떻게 하나요?', kind: 'FAQ', topic: 'DELIVERY', publishedAt: null }),
];

const open = (initial: SupportPostItem[] = POSTS) => render(<SupportEditor initial={initial} />);

/**
 * **고치기는 본문을 받아 와서 폼을 채운다.** 목록이 본문을 안 들고 오기 때문이다.
 * 그래서 모의 응답은 주소를 보고 갈린다 — GET 한 건이면 그 글, 나머지는 그냥 성공.
 */
const detail = (over: Record<string, unknown> = {}) => ({
  id: 's-1', kind: 'NOTICE', title: '추석 배송 안내', body: '본문', bodyRich: null,
  topic: null, pinned: false, sortOrder: 0, publishedAt: '2026-10-01T00:00:00.000Z',
  ...over,
});

const ok = () =>
  vi.fn(async (url: string, init?: RequestInit) =>
    (init?.method ?? 'GET') === 'GET'
      ? new Response(JSON.stringify({ post: detail({ id: String(url).split('/').pop() }) }), { status: 200 })
      : new Response('{}', { status: 200 }));

const fails = (message: string, status = 409) =>
  vi.fn(async () => new Response(JSON.stringify({ message }), { status }));

/** 쓰기 요청만 — 고치기 전에 끼는 GET 을 빼고 본다 */
const writes = () =>
  vi.mocked(fetch).mock.calls.filter(([, init]) => (init?.method ?? 'GET') !== 'GET');

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', ok());
});

/**
 * **어느 글의 단추인지 이름에 넣는다.** 목록이 길어질수록 "수정" 만으로는 짚을 수 없다.
 */
describe('목록의 단추', () => {
  it('수정 단추가 어느 글인지 말한다', () => {
    open();

    expect(screen.getByRole('button', { name: '추석 배송 안내 수정' })).toBeDefined();
    expect(screen.getByRole('button', { name: '교환은 어떻게 하나요? 수정' })).toBeDefined();
  });

  it('내리기 단추도 어느 글인지 말한다', () => {
    open();

    expect(screen.getByRole('button', { name: '추석 배송 안내 내리기' })).toBeDefined();
  });

  /** 게시중인지 초안인지를 색이 아니라 글로 말한다 */
  it('게시 상태를 글로 적는다', () => {
    open();

    expect(screen.getByText('게시중')).toBeDefined();
    expect(screen.getByText('초안')).toBeDefined();
  });
});

/**
 * **브라우저 대화상자 대신 자리 안에서 묻는다.** 차단당하면 조용히 안 먹는 길을 없앤다.
 */
describe('내리기', () => {
  it('첫 누름으로는 내리지 않는다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));

    expect(screen.getByText('내릴까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 내린다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기 확인' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/admin/support/s-1',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    expect(await screen.findByText('내렸습니다.')).toBeDefined();
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '추석 배송 안내 내리기' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 묻는 자리는 누른 줄에만 — 둘이 함께 뜨면 어느 것을 내리는지 모른다 */
  it('묻는 자리는 누른 줄에만 선다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));

    expect(screen.getAllByText('내릴까요?')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '교환은 어떻게 하나요? 내리기' })).toBeDefined();
  });

  it('못 내렸으면 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', fails('이미 내려간 글입니다.'));
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기 확인' }));

    expect(await screen.findByText('이미 내려간 글입니다.')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * **갈래는 FAQ 에만 있다.** 공지에 실어 보내면 계약이 거절한다 — 그 규칙을 core 가 정하고
 * 화면은 따른다.
 */
describe('종류에 따라 갈래가 나타난다', () => {
  const kindSelect = () => screen.getByLabelText('종류');

  it('공지에는 갈래 칸이 없다', () => {
    open();

    expect(screen.queryByLabelText('갈래')).toBeNull();
  });

  it('FAQ 로 바꾸면 갈래 칸이 선다', async () => {
    open();

    await userEvent.selectOptions(kindSelect(), 'FAQ');

    expect(screen.getByLabelText('갈래')).toBeDefined();
  });

  /** 고르지 않아도 하나는 잡혀 있어야 한다 — 비워 보내면 계약이 거절한다 */
  it('FAQ 로 바꾸면 갈래가 비어 있지 않다', async () => {
    open();

    await userEvent.selectOptions(kindSelect(), 'FAQ');

    expect(screen.getByLabelText('갈래')).not.toHaveValue('');
  });

  it('공지로 되돌리면 갈래를 함께 보내지 않는다', async () => {
    open();

    await userEvent.selectOptions(kindSelect(), 'FAQ');
    await userEvent.selectOptions(kindSelect(), 'NOTICE');
    await userEvent.type(screen.getByLabelText(/제목/), '안내');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      kind: string; topic: string | null;
    };
    expect(body).toMatchObject({ kind: 'NOTICE', topic: null });
  });
});

describe('새 글', () => {
  /** 올리자마자 손님에게 보이면 되돌릴 틈이 없다 — 켜는 것은 사람이 한다 */
  it('처음에는 초안으로 만든다', async () => {
    open();

    await userEvent.type(screen.getByLabelText(/제목/), '안내');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      published: boolean;
    };
    expect(body.published).toBe(false);
  });

  it('등록하면 폼을 비우고 그렇게 말한다', async () => {
    open();

    await userEvent.type(screen.getByLabelText(/제목/), '안내');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('등록했습니다.')).toBeDefined();
    await waitFor(() => expect(screen.getByLabelText(/제목/)).toHaveValue(''));
  });

  it('못 등록했으면 적은 것을 지우지 않는다', async () => {
    vi.stubGlobal('fetch', fails('같은 제목이 있습니다.'));
    open();

    await userEvent.type(screen.getByLabelText(/제목/), '안내');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText('같은 제목이 있습니다.')).toBeDefined();
    expect(screen.getByLabelText(/제목/)).toHaveValue('안내');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.type(screen.getByLabelText(/제목/), '안내');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    expect(await screen.findByText(/네트워크 오류/)).toBeDefined();
  });
});

describe('고치기', () => {
  it('수정을 누르면 그 글의 값으로 폼이 채워진다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    expect(screen.getByLabelText(/제목/)).toHaveValue('추석 배송 안내');
    expect(screen.getByRole('heading', { name: '글 수정' })).toBeDefined();
  });

  it('고치면 그 글의 창구로 PUT 한다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    await waitFor(() => expect(writes().length).toBe(1));
    const [url, init] = writes()[0]!;
    expect(url).toBe('/api/admin/support/s-1');
    expect((init as RequestInit).method).toBe('PUT');
  });

  it('그 글의 본문을 받아 와서 채운다 — 목록은 본문을 안 들고 온다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/support/s-1');
    expect(init?.method ?? 'GET').toBe('GET');
  });

  it('받아 오지 못하면 폼을 열지 않고 까닭을 말한다', async () => {
    /*
     * **빈 폼을 열면 그것을 저장하는 순간 본문이 날아간다.** 조용히 글을 비우는 길이라,
     * 못 받아 왔으면 아예 열지 않는다.
     */
    vi.stubGlobal('fetch', fails('글을 찾을 수 없습니다.', 404));
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    expect(await screen.findByText('글을 찾을 수 없습니다.')).toBeDefined();
    expect(screen.getByRole('heading', { name: '새 글' })).toBeDefined();
  });

  it('망이 끊겨도 폼을 열지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    expect(await screen.findByText(/네트워크 오류/)).toBeDefined();
    expect(screen.getByRole('heading', { name: '새 글' })).toBeDefined();
  });

  it('같은 글을 다시 열 때 또 묻지 않는다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));
    await userEvent.click(screen.getByRole('button', { name: '교환은 어떻게 하나요? 수정' }));
    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    // 세 번 눌렀지만 받아 온 것은 두 글뿐이다
    expect(vi.mocked(fetch).mock.calls.length).toBe(2);
  });

  it('고치고 나면 새 글 폼으로 돌아간다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));
    await userEvent.click(screen.getByRole('button', { name: '수정' }));

    expect(await screen.findByText('수정했습니다.')).toBeDefined();
    await waitFor(() => expect(screen.getByRole('heading', { name: '새 글' })).toBeDefined());
  });
});

describe('적은 것이 그대로 실려 간다', () => {
  /*
   * 칸마다 핸들러가 달려 있는데 **하나도 안 돌고 있었다.** 고정·순서·게시는 손님
   * 화면의 줄 순서와 노출을 정하는 값이고, 갈래는 FAQ 가 어느 묶음에 들어가는지다.
   */
  const sent = () => JSON.parse(writes()[0]![1]!.body as string) as Record<string, unknown>;

  /** 제목 칸은 FAQ 에서 '질문' 이라고 적힌다 — 묻는 글이라 그 말이 맞다 */
  const fill = async () => {
    await userEvent.type(screen.getByLabelText(/제목|질문/), '새 공지');
  };

  it('갈래를 고르면 그 값이 간다', async () => {
    open();
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'FAQ');
    await userEvent.selectOptions(screen.getByLabelText('갈래'), 'EXCHANGE');
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().topic).toBe('EXCHANGE');
  });

  it('고정을 켜면 그 값이 간다 — 맨 위에 서는 글이다', async () => {
    open();
    await fill();
    await userEvent.click(screen.getByLabelText('목록 맨 위에 고정'));
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().pinned).toBe(true);
  });

  it('순서는 수로 간다 — 글자로 보내면 창구가 튕긴다', async () => {
    // 순서 칸은 FAQ 에만 있다 — 공지는 그 자리에 고정 칸이 선다
    open();
    await userEvent.selectOptions(screen.getByLabelText('종류'), 'FAQ');
    await fill();
    const order = screen.getByLabelText(/순서/);
    await userEvent.clear(order);
    await userEvent.type(order, '30');
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().sortOrder).toBe(30);
  });

  it('게시를 켜면 초안이 아니라 공개로 간다', async () => {
    open();
    await fill();
    await userEvent.click(screen.getByLabelText('지금 내보내기'));
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().published).toBe(true);
  });

  it('편집기가 바꾼 나무가 그대로 간다', async () => {
    open();
    await fill();
    await userEvent.click(screen.getByRole('button', { name: '본문 고치기' }));
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(sent().bodyRich).toMatchObject({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: '고친 본문' }] }],
    });
  });
});

describe('옛 글을 편집기에 올릴 때', () => {
  type Doc = { content: { content?: { text: string }[] }[] };
  const docOf = (): Doc => JSON.parse(screen.getByTestId('body-doc').textContent);

  it('나무가 있으면 그것을 쓴다', async () => {
    const rich = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '나무로 쓴 글' }] }] };
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ post: detail({ bodyRich: rich, body: '평문은 낡았다' }) }), { status: 200 })));
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    await waitFor(() => expect(docOf().content[0]!.content![0]!.text).toBe('나무로 쓴 글'));
  });

  it('나무가 없으면 평문을 줄마다 문단으로 끊는다 — 그대로 두면 저장하는 순간 본문이 사라진다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({ post: detail({ bodyRich: null, body: '첫 줄\n\n셋째 줄' }) }), { status: 200 })));
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));

    await waitFor(() => expect(docOf().content).toHaveLength(3));
    const texts = docOf().content.map((p) => p.content?.[0]?.text ?? '');
    expect(texts).toEqual(['첫 줄', '', '셋째 줄']);
  });
});

describe('본문을 받아 오는 동안', () => {
  it('또 눌러도 두 번 받아 오지 않는다 — 두 글이 섞여 채워지면 엉뚱한 본문을 저장한다', async () => {
    let give!: (r: Response) => void;
    const fetchMock = vi.fn(async () => new Promise<Response>((resolve) => { give = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    open();

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));
    await userEvent.click(screen.getByRole('button', { name: '교환은 어떻게 하나요? 수정' }));

    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      give(new Response(JSON.stringify({ post: detail() }), { status: 200 }));
    });
  });
});

describe('고치던 글을 내리면', () => {
  it('폼을 새 글로 되돌린다 — 없는 글을 고치고 있을 수 없다', async () => {
    open();
    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 수정' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기' }));
    await userEvent.click(screen.getByRole('button', { name: '추석 배송 안내 내리기 확인' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '등록' })).toBeInTheDocument());
    expect(screen.getByLabelText(/제목/)).toHaveValue('');
  });
});
