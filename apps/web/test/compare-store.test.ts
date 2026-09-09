import { describe, it, expect, beforeEach } from 'vitest';
import { MAX_COMPARE } from '@shop/core';
import { useCompare } from '~/stores/compare';

/** 같은 갈래의 상품 하나 */
const coat = (n: number) => ({ slug: `coat-${n}`, categorySlug: 'outer-coat', name: `코트 ${n}` });
const knit = { slug: 'knit-1', categorySlug: 'knit-crewneck', name: '니트' };

beforeEach(() => useCompare.setState({ items: [] }));

describe('비교함', () => {
  it('같은 체크박스가 담기와 빼기를 다 한다', () => {
    useCompare.getState().toggle(coat(1));
    expect(useCompare.getState().items).toHaveLength(1);

    useCompare.getState().toggle(coat(1));
    expect(useCompare.getState().items).toEqual([]);
  });

  it('담은 차례를 지킨다 — 비교표의 칸 차례가 매번 바뀌면 눈이 못 따라간다', () => {
    for (const n of [3, 1, 2]) useCompare.getState().toggle(coat(n));
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['coat-3', 'coat-1', 'coat-2']);
  });

  it(`${MAX_COMPARE}개가 차면 더 담기지 않는다`, () => {
    for (let n = 0; n < MAX_COMPARE + 2; n += 1) useCompare.getState().toggle(coat(n));
    expect(useCompare.getState().items).toHaveLength(MAX_COMPARE);
  });

  it('가득 차도 이미 담긴 것은 뺄 수 있다 — 그러지 않으면 갇힌다', () => {
    for (let n = 0; n < MAX_COMPARE; n += 1) useCompare.getState().toggle(coat(n));
    useCompare.getState().toggle(coat(0));
    expect(useCompare.getState().items.map((i) => i.slug)).not.toContain('coat-0');
  });

  it('다른 갈래는 담기지 않는다', () => {
    useCompare.getState().toggle(coat(1));
    useCompare.getState().toggle(knit);
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['coat-1']);
  });

  it('비어 있으면 어느 갈래든 첫 번째가 된다', () => {
    useCompare.getState().toggle(knit);
    expect(useCompare.getState().items).toHaveLength(1);
  });

  it('하나 빼기와 비우기', () => {
    useCompare.getState().toggle(coat(1));
    useCompare.getState().toggle(coat(2));

    useCompare.getState().remove('coat-1');
    expect(useCompare.getState().items.map((i) => i.slug)).toEqual(['coat-2']);

    useCompare.getState().clear();
    expect(useCompare.getState().items).toEqual([]);
  });
});
