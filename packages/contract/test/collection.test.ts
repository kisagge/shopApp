import { describe, it, expect } from 'vitest';
import {
  createCollectionSchema,
  updateCollectionSchema,
  setCollectionItemsSchema,
} from '../src/collection';

const base = { slug: 'winter-outer', title: '겨울을 오래 입는 방법' };

describe('기획전 만들기', () => {
  it('주소와 제목만으로 만들 수 있다', () => {
    const parsed = createCollectionSchema.parse(base);
    expect(parsed).toMatchObject({ tone: 'sand', isActive: true, subtitle: null });
  });

  it('제목이 비면 거절한다', () => {
    const result = createCollectionSchema.safeParse({ ...base, title: '  ' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('valid.titleRequired');
  });

  it.each(['Winter', 'winter outer', '겨울', '-x'])('주소 %s 를 거절한다', (slug) => {
    const result = createCollectionSchema.safeParse({ ...base, slug });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('valid.slugFormat');
  });

  it('뒤집힌 기간을 거절한다 — 아무 때도 노출되지 않는다', () => {
    const result = createCollectionSchema.safeParse({
      ...base,
      startsAt: '2026-03-02T00:00:00Z',
      endsAt: '2026-03-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('valid.endBeforeStart');
  });

  it('빈 문자열 기간은 "없음" 으로 읽는다 — 폼이 비운 칸을 그렇게 보낸다', () => {
    const parsed = createCollectionSchema.parse({ ...base, startsAt: '', endsAt: '' });
    expect(parsed.startsAt).toBeNull();
    expect(parsed.endsAt).toBeNull();
  });
});

describe('부분 갱신', () => {
  it('보내지 않은 칸에 기본값을 채우지 않는다', () => {
    const parsed = updateCollectionSchema.parse({ title: '새 제목' });
    expect(Object.keys(parsed)).toEqual(['title']);
  });

  it('기간 규칙은 여기서도 본다', () => {
    const result = updateCollectionSchema.safeParse({
      startsAt: '2026-03-02T00:00:00Z',
      endsAt: '2026-03-01T00:00:00Z',
    });
    expect(result.success).toBe(false);
  });
});

describe('담긴 상품', () => {
  it('빈 배열도 받는다 — 다 빼는 것도 편집이다', () => {
    expect(setCollectionItemsSchema.parse({ productIds: [] }).productIds).toEqual([]);
  });

  it('같은 상품이 두 번 담기면 거절한다', () => {
    const result = setCollectionItemsSchema.safeParse({ productIds: ['a', 'b', 'a'] });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('valid.duplicateItems');
  });

  it('담을 수 있는 수를 넘기면 거절한다', () => {
    const result = setCollectionItemsSchema.safeParse({
      productIds: Array.from({ length: 41 }, (_, i) => `p-${i}`),
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('valid.tooManyItems');
  });
});
