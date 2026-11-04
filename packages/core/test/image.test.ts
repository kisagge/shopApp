import { describe, it, expect } from 'vitest';
import {
  sniffImageType, verifyImageBytes, imageObjectKey, resequence, defaultAlt, isImageContentType, ImageError, MAX_IMAGE_BYTES, reviewImageObjectKey, brandLogoObjectKey, MAX_IMAGES_PER_REVIEW, MAX_IMAGES_PER_PRODUCT,
  inquiryImageObjectKey, uploadBodyLimit, MAX_IMAGES_PER_INQUIRY,
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

describe('브랜드 로고 키', () => {
  const ok = { brandId: 'b-1', contentType: 'image/png' as const, token: 'abcd1234efgh' };

  it('브랜드 아래에 둔다 — 상품 사진과 섞으면 "로고만 정리" 가 안 된다', () => {
    expect(brandLogoObjectKey(ok)).toBe('brands/b-1/abcd1234efgh.png');
  });

  it('형식마다 확장자가 따라간다', () => {
    expect(brandLogoObjectKey({ ...ok, contentType: 'image/webp' })).toMatch(/\.webp$/);
  });

  it('이상한 토큰은 거절한다 — 경로 탈출이 여기서 나온다', () => {
    expect(() => brandLogoObjectKey({ ...ok, token: '../../etc/passwd' })).toThrow();
    expect(() => brandLogoObjectKey({ ...ok, token: 'short' })).toThrow();
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

/**
 * **본문 전체의 상한은 읽기 전에 재는 값이다.**
 *
 * `uploadBodyLimit` 은 Content-Length 와 견줄 수를 만든다. 파일별 상한은 `formData()`
 * 뒤에 보는데 그 한 줄이 끝나면 본문은 이미 메모리에 있다 — 그래서 먼저 끊을 값이
 * 따로 있다(모듈 주석이 그 까닭을 적는다). 그런데 이 함수를 부르는 검사가 없었다.
 */
describe('본문 상한', () => {
  it('파일 수만큼 커진다', () => {
    expect(uploadBodyLimit(2) - uploadBodyLimit(1)).toBe(MAX_IMAGE_BYTES);
  });

  it('파일 수만큼의 상한보다 넉넉하다 — multipart 경계와 data 칸이 그만큼 더 온다', () => {
    expect(uploadBodyLimit(MAX_IMAGES_PER_PRODUCT)).toBeGreaterThan(
      MAX_IMAGE_BYTES * MAX_IMAGES_PER_PRODUCT,
    );
  });

  /**
   * **0 장이라고 상한이 여유분만 남으면 안 된다.**
   *
   * 부르는 쪽이 0 이나 음수를 넘기는 길은 상수를 잘못 쓰는 것인데, 그때 상한이
   * 여유분(1MB)만 남으면 **정상 업로드가 통째로 거절**된다. `Math.max(1, …)` 이 그
   * 자리를 받는다.
   */
  it.each([0, -1])('파일 수가 %s 이어도 한 장 몫은 남는다', (count) => {
    expect(uploadBodyLimit(count)).toBe(uploadBodyLimit(1));
  });
});

/**
 * **문의 사진의 토큰은 더 길다 — 일부러 그렇다.**
 *
 * 저장 키를 만드는 함수가 넷인데 문의만 **16자 이상**을 요구하고 나머지는 8자다. 까닭은
 * 보는 사람이 다르다: 상품·리뷰·로고 사진은 어차피 누구나 보는 것이고, **문의 사진은
 * 비공개인데 주소는 공개 저장소에 있다**(함수 주석이 그렇게 적는다). 주소를 맞힐 수
 * 있으면 비공개가 아니다.
 *
 * 그 차이를 적어 두지 않으면 **옆 함수를 베껴 8자로 내려앉는다** — 그래도 아무 검사도
 * 지지 않았다. 네 자리를 한 표에서 함께 본다.
 */
describe('저장 키의 토큰 최소 길이', () => {
  const t = (n: number) => 'a'.repeat(n);

  const BUILDERS: readonly {
    readonly label: string;
    readonly min: number;
    readonly build: (token: string) => string;
  }[] = [
    { label: '상품 사진', min: 8, build: (token) => imageObjectKey({ productId: 'p-1', contentType: 'image/jpeg', token }) },
    { label: '리뷰 사진', min: 8, build: (token) => reviewImageObjectKey({ orderItemId: 'oi-1', contentType: 'image/jpeg', token }) },
    { label: '브랜드 로고', min: 8, build: (token) => brandLogoObjectKey({ brandId: 'b-1', contentType: 'image/jpeg', token }) },
    { label: '문의 사진(비공개)', min: 16, build: (token) => inquiryImageObjectKey({ authorId: 'u-1', contentType: 'image/jpeg', token }) },
  ];

  // 표가 헛돌지 않는지 — 넷을 다 적었고, 문의만 다르다
  it('네 자리를 보고 있고 문의만 더 길다', () => {
    expect(BUILDERS).toHaveLength(4);
    expect(BUILDERS.filter((b) => b.min === 16).map((b) => b.label)).toEqual(['문의 사진(비공개)']);
  });

  it.each(BUILDERS)('$label: $min 자는 받는다', ({ min, build }) => {
    expect(build(t(min))).toContain(t(min));
  });

  it.each(BUILDERS)('$label: $min 자에서 한 자 모자라면 거절한다', ({ min, build }) => {
    expect(() => build(t(min - 1))).toThrow(ImageError);
  });
});

/**
 * 문의 사진의 저장 키.
 *
 * **쓴 사람 아래에 둔다.** 계정을 닫거나 문의를 지울 때 그 사람의 것을 한 번에 찾아야
 * 하는데, 문의 아래에 두면 문의 행이 사라진 뒤 사진만 남아 주인을 잃는다.
 */
describe('문의 사진의 저장 키', () => {
  const token = 'abcdefghij123456';

  it('쓴 사람 아래에 넣고 확장자는 타입에서 온다', () => {
    expect(inquiryImageObjectKey({ authorId: 'u-7', contentType: 'image/webp', token }))
      .toBe(`inquiries/u-7/${token}.webp`);
  });

  it('파일 이름을 쓰지 않는다 — 경로 탈출과 덮어쓰기를 막는다', () => {
    expect(() => inquiryImageObjectKey({ authorId: 'u-7', contentType: 'image/jpeg', token: '../../etc/passwd' }))
      .toThrow(ImageError);
  });

  it('장 수 상한이 있다 — 불량을 보여 주는 데는 몇 장이면 된다', () => {
    expect(MAX_IMAGES_PER_INQUIRY).toBeGreaterThan(0);
    expect(MAX_IMAGES_PER_INQUIRY).toBeLessThan(MAX_IMAGES_PER_PRODUCT);
  });
});
