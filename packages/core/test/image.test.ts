import { describe, it, expect } from 'vitest';
import {
  sniffImageType, verifyImageBytes, imageObjectKey, resequence, defaultAlt, isImageContentType, ImageError, MAX_IMAGE_BYTES, reviewImageObjectKey, MAX_IMAGES_PER_REVIEW, MAX_IMAGES_PER_PRODUCT,
} from '../src/image';

const bytes = (...values: number[]) => new Uint8Array(values);
const pad = (head: number[], length = 32) =>
  new Uint8Array([...head, ...Array<number>(Math.max(0, length - head.length)).fill(0)]);

const JPEG = pad([0xff, 0xd8, 0xff, 0xe0]);
const PNG = pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const WEBP = pad([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
const AVIF = pad([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
const HTML = pad([0x3c, 0x21, 0x44, 0x4f, 0x43, 0x54, 0x59, 0x50, 0x45]); // <!DOCTYPE
const SVG = pad([0x3c, 0x73, 0x76, 0x67]); // <svg

describe('매직 바이트 판별', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WebP', WEBP, 'image/webp'],
    ['AVIF', AVIF, 'image/avif'],
  ])('%s 를 알아본다', (_label, data, expected) => {
    expect(sniffImageType(data)).toBe(expected);
  });

  it('HTML 은 이미지가 아니다', () => {
    expect(sniffImageType(HTML)).toBeNull();
  });

  it('SVG 도 통과시키지 않는다 — 안에 스크립트가 들어갈 수 있다', () => {
    expect(sniffImageType(SVG)).toBeNull();
  });

  it('RIFF 컨테이너지만 WEBP 가 아니면 거절한다', () => {
    // RIFF 는 WAV 도 쓰는 컨테이너라 앞 4바이트만 보면 안 된다
    const wav = pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(sniffImageType(wav)).toBeNull();
  });

  it('짧은 파일에도 터지지 않는다', () => {
    expect(sniffImageType(bytes(0xff))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe('업로드 검증', () => {
  it('선언과 내용이 맞으면 통과한다', () => {
    expect(verifyImageBytes({ bytes: PNG, declaredType: 'image/png' })).toBe('image/png');
  });

  it('PNG 라고 우긴 HTML 을 거절한다', () => {
    // 확장자와 헤더는 보내는 쪽이 마음대로 적을 수 있다
    expect(() => verifyImageBytes({ bytes: HTML, declaredType: 'image/png' }))
      .toThrow(new ImageError('CONTENT_MISMATCH'));
  });

  it('내용은 이미지지만 선언이 다르면 거절한다 — 조용히 고쳐 주지 않는다', () => {
    expect(() => verifyImageBytes({ bytes: PNG, declaredType: 'image/jpeg' }))
      .toThrow(new ImageError('CONTENT_MISMATCH'));
  });

  it('허용하지 않는 타입은 내용을 보기 전에 막는다', () => {
    expect(() => verifyImageBytes({ bytes: SVG, declaredType: 'image/svg+xml' }))
      .toThrow(new ImageError('UNSUPPORTED_TYPE'));
  });

  it('빈 파일은 거절한다', () => {
    expect(() => verifyImageBytes({ bytes: new Uint8Array(), declaredType: 'image/png' }))
      .toThrow(new ImageError('EMPTY_FILE'));
  });

  it('5MB 를 넘으면 거절한다', () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG.slice(0, 8));
    expect(() => verifyImageBytes({ bytes: big, declaredType: 'image/png' }))
      .toThrow(new ImageError('TOO_LARGE'));
  });

  it('경계값인 5MB 정확히는 통과한다', () => {
    const exact = new Uint8Array(MAX_IMAGE_BYTES);
    exact.set(PNG.slice(0, 8));
    expect(verifyImageBytes({ bytes: exact, declaredType: 'image/png' })).toBe('image/png');
  });

  it('허용 타입 판별', () => {
    expect(isImageContentType('image/webp')).toBe(true);
    expect(isImageContentType('image/svg+xml')).toBe(false);
    expect(isImageContentType('image/gif')).toBe(false);
  });
});

describe('저장 키', () => {
  const base = { productId: 'p-1', contentType: 'image/webp' as const };

  it('상품 아래 토큰 이름으로 넣는다', () => {
    expect(imageObjectKey({ ...base, token: 'a1b2c3d4e5' }))
      .toBe('products/p-1/a1b2c3d4e5.webp');
  });

  it('타입별 확장자를 붙인다', () => {
    expect(imageObjectKey({ ...base, contentType: 'image/jpeg', token: 'abcdefgh' }))
      .toMatch(/\.jpg$/);
  });

  it.each([
    ['경로 탈출', '../../etc/passwd'],
    ['슬래시', 'a/b'],
    ['너무 짧음', 'abc'],
    ['공백', 'abcd efgh'],
    ['한글', '한글토큰이름입니다'],
  ])('토큰에 %s 는 못 쓴다', (_label, token) => {
    expect(() => imageObjectKey({ ...base, token })).toThrow(ImageError);
  });
});

describe('정렬 재부여', () => {
  it('0부터 빈틈없이 다시 매긴다', () => {
    expect(resequence(['a', 'b', 'c'])).toEqual([
      { item: 'a', sortOrder: 0 },
      { item: 'b', sortOrder: 1 },
      { item: 'c', sortOrder: 2 },
    ]);
  });

  it('빈 목록도 다룬다', () => {
    expect(resequence([])).toEqual([]);
  });
});

describe('대체 텍스트 기본값', () => {
  it('대표 이미지는 브랜드와 상품명만 쓴다', () => {
    expect(defaultAlt({ brandName: 'MOOR', productName: '울 코트', index: 0 }))
      .toBe('MOOR 울 코트');
  });

  it('두 번째부터는 몇 번째인지 밝힌다', () => {
    // 같은 문장이 반복되면 스크린리더로 훑을 때 구분이 안 된다
    expect(defaultAlt({ brandName: 'MOOR', productName: '울 코트', index: 2 }))
      .toBe('MOOR 울 코트 상세 이미지 2');
  });
});

describe('리뷰 사진 키', () => {
  const ok = { orderItemId: 'oi-1', contentType: 'image/png' as const, token: 'abcd1234efgh' };

  it('상품과 접두사를 나눈다', () => {
    // 한 폴더에 섞으면 나중에 "리뷰 사진만 정리" 같은 일을 할 수 없다
    expect(reviewImageObjectKey(ok)).toBe('reviews/oi-1/abcd1234efgh.png');
    expect(imageObjectKey({ productId: 'p-1', contentType: 'image/png', token: ok.token }))
      .toBe('products/p-1/abcd1234efgh.png');
  });

  it('형식마다 확장자가 따라간다', () => {
    expect(reviewImageObjectKey({ ...ok, contentType: 'image/webp' })).toMatch(/\.webp$/);
    expect(reviewImageObjectKey({ ...ok, contentType: 'image/avif' })).toMatch(/\.avif$/);
  });

  it('이상한 토큰은 거절한다 — 경로 탈출이 여기서 나온다', () => {
    expect(() => reviewImageObjectKey({ ...ok, token: '../../etc/passwd' })).toThrow();
    expect(() => reviewImageObjectKey({ ...ok, token: 'short' })).toThrow();
    expect(() => reviewImageObjectKey({ ...ok, token: 'a/b/c12345678' })).toThrow();
  });

  it('리뷰 사진 한도는 상품보다 적다', () => {
    // 상품 사진은 파는 쪽이 고른 것이고 리뷰 사진은 휴대폰으로 찍은 것이다
    expect(MAX_IMAGES_PER_REVIEW).toBeLessThan(MAX_IMAGES_PER_PRODUCT);
  });
});
