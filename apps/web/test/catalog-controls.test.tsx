// @vitest-environment jsdom
import { render, screen, within } from './render';
import { describe, it, expect, vi } from 'vitest';
import { PRODUCT_SORT, PRICE_BUCKET, FACET_KEYS } from '@shop/core';

/**
 * 정렬·좁혀 보기 — **목록 화면의 조작부 전부.**
 *
 * 320줄인데 검사가 한 줄도 없었다. 카테고리·브랜드·기획전·검색 네 화면이 모두 이것을 쓰고, 여기가
 * 깨지면 손님은 **찾는 것을 못 찾는다**. 타입 검사는 통과하고 e2e 의 axe 훑기도 통과한다 —
 * 마크업은 맞고 값만 틀리기 때문이다.
 *
 * **GET 폼이다.** 조건이 주소에 남아야 공유하고 뒤로 갈 수 있고, 자바스크립트 없이도 동작한다.
 * 그래서 여기서 보는 것은 "폼이 무엇을 들고 가는가" 와 "지금 무엇이 걸려 있다고 말하는가" 다.
 */

vi.mock('~/lib/i18n/server', async () => {
  const { createTranslator } = await import('@shop/i18n/all');
  const t = createTranslator('ko');
  return { getT: async () => t, getLocale: async () => 'ko' };
});

const { CatalogControls } = await import('~/components/catalog-controls');

const open = async (props: Record<string, unknown> = {}) =>
  render(await CatalogControls({ action: '/category/outer', sort: 'recommended', total: 34, ...props } as never));

const hidden = (name: string) =>
  document.querySelector<HTMLInputElement>(`input[type="hidden"][name="${name}"]`);
const group = () => document.querySelector('details')!;

describe('폼이 들고 가는 것', () => {
  /** 정렬을 바꾸면 폼이 다시 전송된다 — 검색어가 빠지면 그 순간 전체 목록으로 튄다 */
  it('검색어를 숨은 칸으로 들고 간다', async () => {
    await open({ query: '코트' });

    expect(hidden('q')?.value).toBe('코트');
  });

  it('검색어가 없으면 그 칸을 만들지 않는다', async () => {
    await open();

    expect(hidden('q')).toBeNull();
  });

  it('주어진 경로로 돌아간다 — 화면마다 다르다', async () => {
    await open();

    expect(document.querySelector('form')?.getAttribute('action')).toBe('/category/outer');
    expect(document.querySelector('form')?.getAttribute('method')).toBe('get');
  });

  it('core 가 아는 정렬을 전부 내민다', async () => {
    await open();

    const options = within(screen.getByLabelText('정렬')).getAllByRole('option');
    expect(options).toHaveLength(PRODUCT_SORT.length);
  });

  it('지금 정렬이 고른 것으로 서 있다', async () => {
    await open({ sort: 'price_asc' });

    expect(screen.getByLabelText<HTMLSelectElement>('정렬').value).toBe('price_asc');
  });
});

/**
 * **접어 둔다.** 색이 열두 개인 분류에서는 칩만 네 줄이고 옷이 접힌 곳 아래로 밀렸다 — 옷 가게를
 * 열었는데 옷이 안 보인다. 그래도 **걸려 있으면 펼친다**: 접힌 채로 조건이 걸려 있으면 손님은
 * 왜 결과가 적은지 모른다.
 */
describe('접고 펴기', () => {
  it('아무 조건이 없으면 접는다', async () => {
    await open();

    expect(group().open).toBe(false);
  });

  it.each([
    ['가격 구간', { priceBucket: 'under-100k' }],
    ['직접 적은 최소 금액', { minPrice: 50_000 }],
    ['직접 적은 최대 금액', { maxPrice: 200_000 }],
    ['브랜드', { brands: [{ slug: 'moor', name: 'MOOR' }], selectedBrands: ['moor'] }],
    ['색', { facets: { color: [{ value: '오트밀', swatchHex: null }], size: [] }, selected: { color: ['오트밀'], size: [] } }],
  ])('%s 가 걸려 있으면 펼친 채로 연다', async (_label, props) => {
    await open(props);

    expect(group().open).toBe(true);
  });

  /**
   * **접혀 있어도 조건은 폼과 함께 넘어간다.** `disabled` 가 아니기 때문이다 — 접은 채로 정렬만
   * 바꿔도 걸어 둔 색·사이즈가 풀리지 않는다.
   */
  it('접은 채로도 체크된 칸이 폼 안에 남는다', async () => {
    await open({
      facets: { color: [{ value: '오트밀', swatchHex: null }], size: [] },
      selected: { color: [], size: [] },
    });

    const box = screen.getByRole('checkbox', { name: '오트밀' });
    expect(group().open).toBe(false);
    expect(box.closest('form')).not.toBeNull();
    expect((box as HTMLInputElement).disabled).toBe(false);
  });
});

/**
 * **접혀 있을 때 유일한 신호가 그 수다.** 하나라도 안 세면 손님은 조건이 걸린 줄 모르고 결과가
 * 적은 까닭을 찾는다.
 */
describe('몇 개 걸려 있다고 말하는가', () => {
  const count = () => screen.queryByText(/개 적용 중/)?.textContent ?? null;

  it('아무것도 없으면 말하지 않는다', async () => {
    await open();

    expect(count()).toBeNull();
  });

  it('가격 구간 하나를 센다', async () => {
    await open({ priceBucket: '100k-200k' });

    expect(count()).toBe('1개 적용 중');
  });

  it('직접 적은 두 칸을 각각 센다', async () => {
    await open({ minPrice: 50_000, maxPrice: 200_000 });

    expect(count()).toBe('2개 적용 중');
  });

  it('브랜드와 색·사이즈를 모두 더한다', async () => {
    await open({
      brands: [{ slug: 'moor', name: 'MOOR' }, { slug: 'kin', name: 'KIN' }],
      selectedBrands: ['moor', 'kin'],
      facets: {
        color: [{ value: '오트밀', swatchHex: null }],
        size: [{ value: 'M', swatchHex: null }, { value: 'L', swatchHex: null }],
      },
      selected: { color: ['오트밀'], size: ['M', 'L'] },
      priceBucket: 'under-100k',
    });

    // 브랜드 2 + 색 1 + 사이즈 2 + 구간 1
    expect(count()).toBe('6개 적용 중');
  });
});

/**
 * **칸의 끝은 99,999 처럼 하나 모자란 값이다.** 그 숫자를 그대로 보여 주면 읽는 사람이 셈을 하게
 * 되므로, 이웃 칸이 시작하는 둥근 값으로 말한다.
 */
describe('가격 구간의 말', () => {
  it('속값을 사람에게 보여 주지 않는다', async () => {
    await open();

    for (const bucket of PRICE_BUCKET) {
      if (bucket.max === null) continue;
      expect(document.body.textContent, bucket.id).not.toContain(String(bucket.max));
    }
  });

  it('구간마다 라디오가 하나씩, 거기에 "전체" 가 하나 더', async () => {
    await open();

    const radios = screen.getAllByRole('radio');
    expect(radios).toHaveLength(PRICE_BUCKET.length + 1);
  });

  it('고른 구간이 눌린 것으로 서 있다', async () => {
    await open({ priceBucket: '200k-300k' });

    const picked = screen.getAllByRole<HTMLInputElement>('radio').filter((r) => r.defaultChecked);
    expect(picked).toHaveLength(1);
    expect(picked[0]!.value).toBe('200k-300k');
  });

  it('구간을 안 골랐으면 "전체" 가 눌려 있다', async () => {
    await open();

    const picked = screen.getAllByRole<HTMLInputElement>('radio').filter((r) => r.defaultChecked);
    expect(picked[0]!.value).toBe('');
  });

  /**
   * **구간의 속값을 숫자 칸에 되돌려 주면 화면이 제 꼬리를 문다.** 199,999 가 칸에 채워지고,
   * 다음에 적용을 누르면 그 값이 구간을 이긴다 — 손님은 자기가 고치지 않은 값에 갇힌다.
   */
  it('구간을 골랐다고 숫자 칸을 채우지 않는다', async () => {
    await open({ priceBucket: '100k-200k' });

    expect(screen.getByLabelText<HTMLInputElement>('최소 가격').value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>('최대 가격').value).toBe('');
  });

  it('사람이 적은 값은 그대로 되돌려 준다', async () => {
    await open({ minPrice: 50_000, maxPrice: 150_000 });

    expect(screen.getByLabelText<HTMLInputElement>('최소 가격').value).toBe('50000');
    expect(screen.getByLabelText<HTMLInputElement>('최대 가격').value).toBe('150000');
  });
});

describe('고를 거리를 그리는 규칙', () => {
  /** 브랜드 화면에서는 브랜드가 이미 주소로 정해져 있다 — 그 안에서 또 고르는 것은 뜻이 없다 */
  it('브랜드를 주지 않으면 그 축을 그리지 않는다', async () => {
    await open();

    expect(screen.queryByRole('group', { name: '브랜드' })).toBeNull();
  });

  it('값이 없는 축은 그리지 않는다', async () => {
    await open({ facets: { color: [{ value: '오트밀', swatchHex: null }], size: [] } });

    expect(screen.getByRole('group', { name: '색상' })).toBeDefined();
    expect(screen.queryByRole('group', { name: '사이즈' })).toBeNull();
  });

  /** 칩처럼 보이지만 실제로는 체크박스다 — 눈에만 보이는 버튼으로 만들면 키보드가 못 닿는다 */
  it('색·사이즈는 체크박스고 가격 구간은 라디오다', async () => {
    await open({
      facets: { color: [{ value: '오트밀', swatchHex: null }], size: [{ value: 'M', swatchHex: null }] },
    });

    expect(screen.getByRole('checkbox', { name: '오트밀' })).toBeDefined();
    expect(screen.getByRole('checkbox', { name: 'M' })).toBeDefined();
    for (const key of FACET_KEYS) expect(key).toBeTruthy();
  });

  it('색 견본은 낭독기에서 숨긴다 — 색 이름이 이미 글자로 있다', async () => {
    await open({ facets: { color: [{ value: '오트밀', swatchHex: '#E8DCC8' }], size: [] } });

    const box = screen.getByRole('checkbox', { name: '오트밀' });
    expect(box.parentElement?.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('초기화', () => {
  it('걸린 것이 없으면 내밀지 않는다 — 늘 있으면 아무도 안 본다', async () => {
    await open();

    expect(screen.queryByRole('link', { name: '조건 초기화' })).toBeNull();
  });

  it('걸려 있으면 조건만 떼고 같은 화면으로 돌아간다', async () => {
    await open({ priceBucket: 'under-100k' });

    expect(screen.getByRole('link', { name: '조건 초기화' }).getAttribute('href'))
      .toBe('/category/outer');
  });

  /** 검색 결과에서 조건만 풀고 싶은 것이지, 검색을 그만두려는 것이 아니다 */
  it('검색어는 남긴다', async () => {
    await open({ query: '울 코트', minPrice: 50_000 });

    expect(screen.getByRole('link', { name: '조건 초기화' }).getAttribute('href'))
      .toBe('/category/outer?q=%EC%9A%B8%20%EC%BD%94%ED%8A%B8');
  });
});

describe('몇 개인지', () => {
  it('수를 알면 적는다', async () => {
    await open({ total: 34 });

    expect(screen.getByText('총 34개')).toBeDefined();
  });

  /** 아직 세는 중이면(스트리밍) 숫자 자리를 비워 둔다 — 0 을 적으면 "없다" 로 읽힌다 */
  it('수를 모르면 0 을 적지 않는다', async () => {
    await open({ total: null });

    expect(document.body.textContent).not.toContain('총 0개');
  });
});
