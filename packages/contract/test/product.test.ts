import { describe, it, expect } from 'vitest';
import { createProductSchema, updateProductSchema, updateStockSchema, createVariantSchema } from '../src';

const valid = {
  slug: 'oat-coat',
  name: '오트 코트',
  brandId: 'clh1abc2300000000000000000',
  categoryId: 'clh1abc2300000000000000001',
  listPrice: 413_000,
  salePrice: 289_000,
  status: 'ACTIVE',
};

describe('상품 등록 계약', () => {
  it('정상 입력을 통과시킨다', () => {
    expect(createProductSchema.safeParse(valid).success).toBe(true);
  });

  it('설명은 생략하면 빈 문자열이 된다', () => {
    const parsed = createProductSchema.parse(valid);
    expect(parsed.description).toBe('');
  });

  it('판매가가 정가보다 크면 거절한다', () => {
    const result = createProductSchema.safeParse({ ...valid, salePrice: 500_000 });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['salePrice']);
  });

  it('판매가와 정가가 같은 것은 허용한다 — 할인 0%', () => {
    expect(createProductSchema.safeParse({ ...valid, salePrice: 413_000 }).success).toBe(true);
  });

  it('판매가 null 은 정가 판매를 뜻한다', () => {
    expect(createProductSchema.safeParse({ ...valid, salePrice: null }).success).toBe(true);
  });

  it.each([
    ['한글', '오트-코트'],
    ['공백', 'oat coat'],
    ['대문자', 'Oat-Coat'],
    ['연속 하이픈', 'oat--coat'],
    ['앞 하이픈', '-oat'],
    ['뒤 하이픈', 'oat-'],
  ])('슬러그에 %s 는 못 쓴다', (_label, slug) => {
    expect(createProductSchema.safeParse({ ...valid, slug }).success).toBe(false);
  });

  it('가격은 소수점을 받지 않는다 — 원 단위 정수만', () => {
    expect(createProductSchema.safeParse({ ...valid, listPrice: 413_000.5 }).success).toBe(false);
  });

  it('음수 가격은 거절한다', () => {
    expect(createProductSchema.safeParse({ ...valid, listPrice: -1 }).success).toBe(false);
  });

  it('모르는 상태값은 거절한다', () => {
    expect(createProductSchema.safeParse({ ...valid, status: 'DELETED' }).success).toBe(false);
  });
});

describe('상품 수정 계약', () => {
  it('일부만 보내도 통과한다', () => {
    expect(updateProductSchema.safeParse({ name: '새 이름' }).success).toBe(true);
  });

  it('둘 다 보낼 때는 가격 관계를 본다', () => {
    expect(
      updateProductSchema.safeParse({ listPrice: 100_000, salePrice: 200_000 }).success,
    ).toBe(false);
  });

  it('보내지 않은 필드는 결과에 나타나지 않는다', () => {
    // Zod 의 .partial() 은 .default() 를 걷어내지 않는다. 기본값이 딸려
    // 들어가면 이름만 고치는 요청이 판매가와 설명을 지워 버린다.
    expect(updateProductSchema.parse({ name: '새 이름' })).toEqual({ name: '새 이름' });
    expect(updateProductSchema.parse({ status: 'ACTIVE' })).toEqual({ status: 'ACTIVE' });
  });

  it('판매가를 지우려면 명시적으로 null 을 보내야 한다', () => {
    expect(updateProductSchema.parse({ salePrice: null })).toEqual({ salePrice: null });
  });

  it('판매가만 보내면 정가를 알 수 없어 통과시킨다 — 서버가 다시 본다', () => {
    // 계약은 한쪽만으로 판단할 수 없다. 이 경우의 최종 판단은 서비스 계층에 있다.
    expect(updateProductSchema.safeParse({ salePrice: 999_999 }).success).toBe(true);
  });
});

describe('재고 계약', () => {
  const variantId = 'clh1abc2300000000000000002';

  it('음수 재고는 거절한다', () => {
    expect(updateStockSchema.safeParse({ variants: [{ variantId, stock: -1 }] }).success).toBe(false);
  });

  it('빈 배열은 거절한다', () => {
    expect(updateStockSchema.safeParse({ variants: [] }).success).toBe(false);
  });

  it('0 은 품절 처리라 허용한다', () => {
    expect(updateStockSchema.safeParse({ variants: [{ variantId, stock: 0 }] }).success).toBe(true);
  });
});

describe('옵션 계약', () => {
  it('SKU 는 대문자·숫자·하이픈만', () => {
    expect(createVariantSchema.safeParse({ sku: 'moor-ct', optionLabel: 'M' }).success).toBe(false);
    expect(createVariantSchema.safeParse({ sku: 'MOOR-CT-M', optionLabel: 'M' }).success).toBe(true);
  });

  it('초기 재고를 안 보내면 0 이다', () => {
    const parsed = createVariantSchema.parse({ sku: 'MOOR-CT-M', optionLabel: 'M' });
    expect(parsed.stock).toBe(0);
  });

  it('옵션명은 비울 수 없다', () => {
    expect(createVariantSchema.safeParse({ sku: 'MOOR-CT-M', optionLabel: '  ' }).success).toBe(false);
  });
});
