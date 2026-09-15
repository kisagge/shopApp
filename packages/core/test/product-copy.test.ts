import { describe, it, expect } from 'vitest';
import { copyNameOf, copySlugCandidate, copySkuCandidate, PRODUCT_NAME_MAX, PRODUCT_SLUG_MAX, VARIANT_SKU_MAX } from '../src';

/** 상품 복제 — 사본은 원본과 겹치지 않고 한눈에 구분된다 */
describe('copyNameOf', () => {
  it('"(사본)" 을 붙이고, 이미 사본이면 또 붙이지 않는다', () => {
    expect(copyNameOf('울 코트')).toBe('울 코트 (사본)');
    expect(copyNameOf('울 코트 (사본)')).toBe('울 코트 (사본)');
  });

  it('길이 상한을 넘기지 않는다 — 원본 이름 쪽을 자른다', () => {
    const long = '가'.repeat(PRODUCT_NAME_MAX);
    const copied = copyNameOf(long);
    expect(copied.length).toBe(PRODUCT_NAME_MAX);
    expect(copied.endsWith(' (사본)')).toBe(true);
  });
});

describe('copySlugCandidate', () => {
  it('-copy, -copy-2 … 로 이어 가고, 사본의 사본은 꼬리를 겹쳐 쌓지 않는다', () => {
    expect(copySlugCandidate('wool-coat', 1)).toBe('wool-coat-copy');
    expect(copySlugCandidate('wool-coat', 3)).toBe('wool-coat-copy-3');
    expect(copySlugCandidate('wool-coat-copy', 2)).toBe('wool-coat-copy-2');
    expect(copySlugCandidate('wool-coat-copy-4', 1)).toBe('wool-coat-copy');
  });

  it('길이를 넘으면 원본 쪽을 자르고, 자른 끝의 하이픈을 지운다 — 주소 형식을 지킨다', () => {
    const slug = `${'a'.repeat(PRODUCT_SLUG_MAX - 7)}-bcdefg`;
    const out = copySlugCandidate(slug, 12);
    expect(out.length).toBeLessThanOrEqual(PRODUCT_SLUG_MAX);
    expect(out).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    expect(out.endsWith('-copy-12')).toBe(true);
  });
});

describe('copySkuCandidate', () => {
  it('-C, -C2 … 를 붙이고 상한과 형식을 지킨다', () => {
    expect(copySkuCandidate('COAT-OAT-M', 1)).toBe('COAT-OAT-M-C');
    expect(copySkuCandidate('COAT-OAT-M', 2)).toBe('COAT-OAT-M-C2');
    const out = copySkuCandidate(`${'A'.repeat(VARIANT_SKU_MAX - 1)}-`, 10);
    expect(out.length).toBeLessThanOrEqual(VARIANT_SKU_MAX);
    expect(out).toMatch(/^[A-Z0-9][A-Z0-9-]*$/);
    expect(out).not.toContain('--');
  });
});
