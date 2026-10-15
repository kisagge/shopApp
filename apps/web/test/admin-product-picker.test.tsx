// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_COLLECTION_ITEMS } from '@shop/core';
import { ProductPicker } from '~/app/admin/collections/product-picker';
import type { PickedProduct } from '~/app/admin/collections/types';

/**
 * 기획전에 담을 상품 고르기 — **손님 화면의 진열을 정하는 자리.**
 *
 * 검사가 한 줄도 없었다. 셋이 있었고, 둘은 오늘 쿠폰 쪽에서 고친 것과 **같은 모양**이었다.
 *
 * **하나, 찾기가 셋을 똑같은 침묵으로 답했다** — 없을 때, 거절당할 때, 길이 끊길 때.
 * 끊긴 자리에는 "후보를 못 받아도 이미 담긴 것은 편집할 수 있다" 고 적혀 있었는데, 맞는
 * 말이지만 **누른 사람이 왜 아무 일도 안 일어났는지 모른다는 문제에는 답하지 않는다.**
 *
 * **둘, 빈 말로도 찾았다.** 같은 창구를 쓰는 다른 두 화면은 빈 말을 막고 까닭도 적어
 * 두었다 — 열자마자 전체 명단이 뜨면 고르는 화면이 아니라 명단을 훑는 화면이 된다.
 *
 * **셋, 후보의 담기 단추가 어느 상품인지 말하지 않았다.**
 */

const product = (id: string, name: string, over: Partial<PickedProduct> = {}): PickedProduct => ({
  id, name, slug: id, brandName: 'PLAIN LABEL', imageUrl: null, onDisplay: true, ...over,
});

const open = (over: { picked?: PickedProduct[]; busy?: boolean } = {}) => {
  const onSave = vi.fn();
  render(
    <ProductPicker
      picked={over.picked ?? [product('p-1', '레더 코트')]}
      busy={over.busy ?? false}
      onSave={onSave}
    />,
  );
  return { onSave };
};

const results = (...rows: [string, string][]) =>
  vi.fn(async () => new Response(
    JSON.stringify({ products: rows.map(([id, name]) => product(id, name)) }),
    { status: 200 },
  ));

const search = async (term: string) => {
  const box = screen.getByLabelText('상품 찾기');
  await userEvent.clear(box);
  if (term) await userEvent.type(box, term);
  await userEvent.click(screen.getByRole('button', { name: '찾기' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', results(['p-2', '램스울 니트']));
});

describe('상품 찾기', () => {
  it('적은 말로 찾아 후보를 세운다', async () => {
    open();

    await search('니트');

    expect(await screen.findByRole('button', { name: '램스울 니트 담기' })).toBeDefined();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('q=%EB%8B%88%ED%8A%B8'));
  });

  /* 열자마자 전체 명단이 뜨면 고르는 화면이 아니라 명단을 훑는 화면이 된다 */
  it('빈 말로는 찾지 않는다', async () => {
    open();

    await search('');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('공백만 적어도 찾지 않는다', async () => {
    open();

    await search('   ');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('찾았는데 없으면 없다고 말한다', async () => {
    vi.stubGlobal('fetch', results());
    open();

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

  it('길이 끊기면 말한다 — 조용히 넘어가지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await search('니트');

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });

  /** 못 받아도 이미 담긴 것은 그대로 편집할 수 있어야 한다 */
  it('못 찾아도 담긴 목록은 그대로 만질 수 있다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open({ picked: [product('p-1', '레더 코트'), product('p-2', '램스울 니트')] });

    await search('니트');
    await screen.findByRole('alert');

    await userEvent.click(screen.getByRole('button', { name: '레더 코트 을(를) 뒤로' }));
    expect(screen.getByRole('button', { name: '상품 저장' })).toBeEnabled();
  });
});

/**
 * **순서 자체가 편집이다.** 그래서 저장은 통째로 한 번에 한다 — 하나씩 넣고 빼면 순서를
 * 바꿀 때마다 요청이 나가고, 중간에 하나가 실패하면 화면과 저장된 순서가 갈라진다.
 */
describe('담긴 목록', () => {
  const picked = [product('p-1', '레더 코트'), product('p-2', '램스울 니트')];

  it('바꾼 것이 없으면 저장할 수 없다', () => {
    open({ picked });

    expect(screen.getByRole('button', { name: '저장됨' })).toBeDisabled();
  });

  it('순서를 바꾸면 바뀐 차례를 통째로 넘긴다', async () => {
    const { onSave } = open({ picked });

    await userEvent.click(screen.getByRole('button', { name: '램스울 니트 을(를) 앞으로' }));
    await userEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'p-2' }),
      expect.objectContaining({ id: 'p-1' }),
    ]);
  });

  it('끝에서는 더 옮길 수 없다', () => {
    open({ picked });

    expect(screen.getByRole('button', { name: '레더 코트 을(를) 앞으로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '램스울 니트 을(를) 뒤로' })).toBeDisabled();
  });

  it('빼면 목록에서 사라지고 저장할 것이 생긴다', async () => {
    open({ picked });

    await userEvent.click(screen.getByRole('button', { name: '레더 코트 빼기' }));

    expect(screen.queryByRole('button', { name: '레더 코트 빼기' })).toBeNull();
    expect(screen.getByRole('button', { name: '상품 저장' })).toBeEnabled();
  });

  /** 비어 있으면 손님 화면에 안 나온다는 사실까지 말한다 */
  it('비어 있으면 그 뜻을 말한다', () => {
    open({ picked: [] });

    expect(screen.getByRole('status')).toHaveTextContent('담기 전에는 손님 화면에 나오지 않습니다');
  });

  /** 담긴 채로 내려간 상품을 어드민에서 감추면 왜 손님 화면에 안 보이는지 알 수 없다 */
  it('내려간 상품은 감추지 않고 그렇다고 적는다', () => {
    open({ picked: [product('p-1', '레더 코트', { onDisplay: false })] });

    expect(screen.getByText('내려감')).toBeDefined();
  });
});

describe('후보에서 담기', () => {
  it('담으면 목록 끝에 붙는다', async () => {
    const { onSave } = open({ picked: [product('p-1', '레더 코트')] });

    await search('니트');
    await userEvent.click(await screen.findByRole('button', { name: '램스울 니트 담기' }));
    await userEvent.click(screen.getByRole('button', { name: '상품 저장' }));

    expect(onSave).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'p-1' }),
      expect.objectContaining({ id: 'p-2' }),
    ]);
  });

  /** 이미 담긴 것을 또 담을 수는 없다 — 단추가 그 사실을 말한다 */
  it('이미 담긴 상품은 담김으로 보이고 눌리지 않는다', async () => {
    vi.stubGlobal('fetch', results(['p-1', '레더 코트']));
    open({ picked: [product('p-1', '레더 코트')] });

    await search('코트');

    const button = await screen.findByRole('button', { name: '레더 코트 담김' });
    expect(button).toBeDisabled();
  });

  /** 한도를 넘기면 담을 수 없다 — 눌러 보고 아무 일도 안 일어나게 두지 않는다 */
  it('한도를 채우면 더 담을 수 없다', async () => {
    const full = Array.from({ length: MAX_COLLECTION_ITEMS }, (_, i) => product(`f-${i}`, `상품 ${i}`));
    open({ picked: full });

    await search('니트');

    expect(await screen.findByRole('button', { name: '램스울 니트 담기' })).toBeDisabled();
  });

  it('몇 개를 담았고 몇 개까지인지 적는다', () => {
    open({ picked: [product('p-1', '레더 코트')] });

    const heading = screen.getByRole('heading', { name: /담긴 상품/ });
    expect(heading).toHaveTextContent('1');
    expect(heading).toHaveTextContent(String(MAX_COLLECTION_ITEMS));
  });

  /** 후보가 스물이면 낭독기에는 "담기" 가 스무 번 들린다 */
  it('담기 단추가 어느 상품인지 말한다', async () => {
    vi.stubGlobal('fetch', results(['p-2', '램스울 니트'], ['p-3', '코튼 셔츠']));
    open();

    await search('상의');

    const names = (await screen.findAllByRole('button', { name: /담기$/ }))
      .map((b) => b.getAttribute('aria-label'));
    expect(names).toEqual(['램스울 니트 담기', '코튼 셔츠 담기']);
  });
});

describe('저장 중', () => {
  it('보내는 동안 저장이 눌리지 않는다', () => {
    open({ picked: [product('p-1', '레더 코트')], busy: true });

    expect(screen.getByRole('button', { name: '저장됨' })).toBeDisabled();
  });
});
