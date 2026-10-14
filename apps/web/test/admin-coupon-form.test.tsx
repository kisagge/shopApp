// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CouponForm } from '~/app/admin/coupons/coupon-form';
import type { CouponRow } from '~/app/admin/coupons/types';

/**
 * 새 쿠폰 폼 — **할인이 어디에, 얼마나 붙을지 정하는 자리.**
 *
 * 검사가 한 줄도 없었다. 그리고 상품 대상을 고르는 쪽에 둘이 있었다.
 *
 * **하나, 찾기가 셋을 똑같은 침묵으로 답했다** — 결과가 없을 때, 서버가 거절할 때, 길이
 * 끊길 때. 결과 칸은 하나라도 있어야 그려지므로 어느 쪽이든 화면이 그대로다. 누른 사람은
 * "그런 상품이 없구나" 와 "검색이 고장났구나" 를 가릴 방법이 없었다.
 *
 * **둘, 다음 검색이 앞서 고른 이름을 지웠다.** 이름을 검색 결과에서만 읽는데 그 목록은
 * 검색마다 통째로 갈린다 — "코트" 로 찾아 하나 고르고 "니트" 로 다시 찾으면, 앞서 고른 칩이
 * `clx8…` 이라는 날것의 id 가 된다. 지우는 단추의 이름표까지 그렇게 된다.
 */

const created: CouponRow = {
  id: 'c-1', code: 'WELCOME10', name: '웰컴 10%', kind: 'PERCENT',
  value: 0, percent: 10, maxDiscount: null, minimumOrder: 0,
  issueLimit: null, issuedCount: 0, usedCount: 0,
  startsAt: '2026-10-01T00:00:00.000Z', endsAt: '2026-12-31T00:00:00.000Z',
  isActive: true, downloadable: true, status: 'ACTIVE', editable: true,
  targetCount: 0, targets: [],
};

const handlers = () => ({
  onCreated: vi.fn(),
  onError: vi.fn(),
  onCancel: vi.fn(),
});

const open = (over: Partial<Parameters<typeof CouponForm>[0]> = {}) => {
  const h = handlers();
  render(
    <CouponForm
      brands={[{ id: 'b-1', name: 'PLAIN LABEL' }]}
      categories={[{ id: 'cat-1', name: '아우터' }]}
      canCancel
      {...h}
      {...over}
    />,
  );
  return h;
};

const products = (...names: [string, string][]) =>
  vi.fn(async () => new Response(
    JSON.stringify({ products: names.map(([id, name]) => ({ id, name })) }),
    { status: 200 },
  ));

const search = async (term: string) => {
  const box = screen.getByLabelText('상품 검색');
  await userEvent.clear(box);
  await userEvent.type(box, term);
  await userEvent.click(screen.getByRole('button', { name: '검색' }));
};

const pick = async (name: string) => userEvent.click(screen.getByLabelText(name));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', products(['p-1', '레더 코트']));
});

describe('상품 찾기', () => {
  it('적은 말로 찾아 결과를 고를 수 있게 세운다', async () => {
    open();

    await search('코트');

    expect(await screen.findByLabelText('레더 코트')).toBeDefined();
    // 적은 말이 그대로 실려 간다 — 한글은 인코딩돼서 나간다
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('q=%EC%BD%94%ED%8A%B8'));
  });

  it('빈 말로는 찾지 않는다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '검색' }));

    expect(fetch).not.toHaveBeenCalled();
  });

  /*
   * 여기가 침묵하던 자리다. 셋이 전부 "화면이 그대로" 였다.
   */
  it('찾았는데 없으면 없다고 말한다 — 아직 안 찾은 것과 다른 말이다', async () => {
    vi.stubGlobal('fetch', products());
    open();

    // 찾기 전에는 그 말을 하지 않는다
    expect(screen.queryByText(/찾은 상품이 없습니다/)).toBeNull();

    await search('없는이름');

    expect(await screen.findByText(/찾은 상품이 없습니다/)).toBeDefined();
  });

  it('서버가 거절하면 그 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: '검색어가 너무 짧습니다.' }), { status: 400 },
    )));
    open();

    await search('ㄱ');

    expect(await screen.findByRole('alert')).toHaveTextContent('검색어가 너무 짧습니다.');
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 그것까지 "네트워크 오류" 로 뭉뚱그리지 않는다 */
  it('응답이 JSON 이 아니어도 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await search('코트');

    expect(await screen.findByRole('alert')).toHaveTextContent('상품을 찾지 못했습니다.');
  });

  it('길이 끊기면 말한다 — 조용히 새지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await search('코트');

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });

  it('실패한 뒤 다시 찾아 되면 지난 경고를 치운다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();
    await search('코트');
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', products(['p-1', '레더 코트']));
    await search('코트');

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByLabelText('레더 코트')).toBeDefined();
  });

  it('찾는 동안 단추가 이름을 바꿔 스스로 설명한다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify({ products: [] }), { status: 200 }));
    })));
    open();

    await search('코트');

    expect(screen.getByRole('button', { name: '찾는 중…' })).toBeDefined();
    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '검색' })).toBeDefined());
  });
});

/**
 * **고른 것이 무엇인지 끝까지 읽혀야 한다.** 쿠폰이 어디에 붙는지 정하는 화면이고,
 * 엉뚱한 상품에 할인이 붙으면 그건 돈이다.
 */
describe('고른 대상', () => {
  it('고르면 칩으로 선다', async () => {
    open();

    await search('코트');
    await pick('레더 코트');

    expect(screen.getByRole('button', { name: '레더 코트 대상에서 빼기' })).toBeDefined();
  });

  /*
   * 여기가 고장이 있던 자리다. 두 번째 검색이 첫 번째에서 고른 이름을 날것의 id 로 바꿨다.
   */
  it('다음 검색을 해도 앞서 고른 이름이 그대로다', async () => {
    open();

    await search('코트');
    await pick('레더 코트');

    vi.stubGlobal('fetch', products(['p-2', '램스울 니트']));
    await search('니트');
    await screen.findByLabelText('램스울 니트');

    expect(screen.getByRole('button', { name: '레더 코트 대상에서 빼기' })).toBeDefined();
    expect(screen.queryByRole('button', { name: /p-1 대상에서 빼기/ })).toBeNull();
  });

  it('두 검색에서 하나씩 골라도 둘 다 이름으로 남는다', async () => {
    open();

    await search('코트');
    await pick('레더 코트');
    vi.stubGlobal('fetch', products(['p-2', '램스울 니트']));
    await search('니트');
    await pick('램스울 니트');

    for (const name of ['레더 코트', '램스울 니트']) {
      expect(screen.getByRole('button', { name: `${name} 대상에서 빼기` }), name).toBeDefined();
    }
  });

  it('칩을 누르면 대상에서 빠진다', async () => {
    open();

    await search('코트');
    await pick('레더 코트');
    await userEvent.click(screen.getByRole('button', { name: '레더 코트 대상에서 빼기' }));

    expect(screen.queryByRole('button', { name: '레더 코트 대상에서 빼기' })).toBeNull();
  });

  /** 브랜드·갈래는 목록을 이미 들고 있으므로 검색과 무관하게 이름이 남는다 */
  it('브랜드를 고르면 그 이름으로 선다', async () => {
    open();

    await pick('PLAIN LABEL');

    expect(screen.getByRole('button', { name: 'PLAIN LABEL 대상에서 빼기' })).toBeDefined();
  });
});

describe('만들 때', () => {
  /** 필수 칸을 다 채운다 — 비면 브라우저가 보내기를 막아 아무 일도 안 일어난다 */
  const fill = async () => {
    await userEvent.type(screen.getByLabelText(/^코드/), 'WELCOME10');
    await userEvent.type(screen.getByLabelText(/^쿠폰 이름/), '웰컴 10%');
    // 처음은 정액 쿠폰이라 할인 금액이 필수다
    await userEvent.type(screen.getByLabelText(/^할인 금액/), '5000');
    // datetime-local 은 한 글자씩 치기 어렵다 — 값을 그대로 넣는다
    fireEvent.change(screen.getByLabelText(/^시작/), { target: { value: '2026-10-01T00:00' } });
    fireEvent.change(screen.getByLabelText(/^종료/), { target: { value: '2026-12-31T23:59' } });
  };

  it('만들어지면 부모에게 그 쿠폰을 넘긴다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ coupon: created }), { status: 200 },
    )));
    const h = open();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }));

    await waitFor(() => expect(h.onCreated).toHaveBeenCalledWith(created));
    expect(h.onError).toHaveBeenCalledWith(null);
  });

  it('거절당하면 까닭을 위로 올리고 칸마다 적는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(
      JSON.stringify({ message: '이미 쓰는 코드입니다.', fields: { code: '중복된 코드' } }),
      { status: 409 },
    )));
    const h = open();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }));

    await waitFor(() => expect(h.onError).toHaveBeenCalledWith('이미 쓰는 코드입니다.'));
    expect(await screen.findByText('중복된 코드')).toBeDefined();
    expect(h.onCreated).not.toHaveBeenCalled();
  });

  /*
   * 앞단이 502 HTML 을 주면 `json()` 이 던진다. 그대로 두면 catch 가 받아 **서버가 답했는데
   * "네트워크 오류" 라고 적는다.**
   */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    const h = open();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }));

    await waitFor(() => expect(h.onError).toHaveBeenCalledWith('쿠폰을 만들지 못했습니다.'));
  });

  it('길이 끊기면 네트워크 오류라고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const h = open();

    await fill();
    await userEvent.click(screen.getByRole('button', { name: '쿠폰 만들기' }));

    await waitFor(() => expect(h.onError).toHaveBeenCalledWith('네트워크 오류로 만들지 못했습니다.'));
  });
});
