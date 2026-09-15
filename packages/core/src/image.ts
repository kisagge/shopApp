/**
 * 상품 이미지 규칙. 순수 로직만 둔다 — 업로드 실행은 앱에 있다.
 *
 * 업로드는 **바깥에서 들어오는 바이트**다. 이 파일의 규칙 대부분은
 * 편의가 아니라 방어다.
 */

/**
 * 받을 수 있는 형식. **허용 목록이고, 그것이 규칙 전부다.**
 *
 * SVG 는 일부러 뺐다 — 안에 <script> 가 들어갈 수 있고, 같은 오리진에서
 * 그대로 내려주면 그 스크립트가 우리 쿠키를 읽는다. 상품 사진에 벡터가
 * 필요한 경우는 없다.
 *
 * 거절 목록을 따로 두었었는데 **아무도 보지 않는 목록이었다.** 막는 것처럼
 * 보이지만 실제로 막는 것은 이 허용 목록이고, 그런 상수는 읽는 사람을
 * 속인다.
 */
export const IMAGE_CONTENT_TYPE = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type ImageContentType = (typeof IMAGE_CONTENT_TYPE)[number];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 8;

/**
 * 리뷰에 붙이는 사진은 상품보다 적게 받는다.
 *
 * 상품 이미지는 파는 쪽이 정성껏 고르는 것이고, 리뷰 사진은 산 사람이
 * 휴대폰으로 찍어 올리는 것이다. 여러 장을 허용할수록 저장소만 커지고
 * 읽는 사람에게 도움이 되는 양은 늘지 않는다.
 */
export const MAX_IMAGES_PER_REVIEW = 5;
/** 1:1 문의 사진. 불량·오배송을 보여 주는 데는 몇 장이면 된다 — 많이 받으면 저장소만 찬다 */
export const MAX_IMAGES_PER_INQUIRY = 3;

const EXTENSION: Readonly<Record<ImageContentType, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export const IMAGE_ERROR = [
  'UNSUPPORTED_TYPE',
  'CONTENT_MISMATCH',
  'TOO_LARGE',
  'EMPTY_FILE',
  'TOO_MANY_IMAGES',
  'TOO_MANY_REVIEW_IMAGES',
  'TOO_MANY_INQUIRY_IMAGES',
  'ALT_REQUIRED',
] as const;
export type ImageErrorCode = (typeof IMAGE_ERROR)[number];

export const IMAGE_ERROR_MESSAGE: Readonly<Record<ImageErrorCode, string>> = {
  UNSUPPORTED_TYPE: 'JPEG · PNG · WebP · AVIF 만 올릴 수 있습니다',
  CONTENT_MISMATCH: '파일 내용이 이미지가 아닙니다',
  TOO_LARGE: '이미지는 5MB 를 넘을 수 없습니다',
  EMPTY_FILE: '빈 파일입니다',
  TOO_MANY_IMAGES: `이미지는 상품당 ${MAX_IMAGES_PER_PRODUCT}장까지입니다`,
  TOO_MANY_REVIEW_IMAGES: `사진은 리뷰당 ${MAX_IMAGES_PER_REVIEW}장까지입니다`,
  TOO_MANY_INQUIRY_IMAGES: `사진은 문의당 ${MAX_IMAGES_PER_INQUIRY}장까지입니다`,
  ALT_REQUIRED: '대체 텍스트를 입력해 주세요',
};

export class ImageError extends Error {
  constructor(readonly code: ImageErrorCode) {
    super(IMAGE_ERROR_MESSAGE[code]);
    this.name = 'ImageError';
  }
}

export function isImageContentType(value: string): value is ImageContentType {
  return (IMAGE_CONTENT_TYPE as readonly string[]).includes(value);
}

/**
 * 파일 앞부분의 매직 바이트로 실제 형식을 알아낸다.
 *
 * **선언된 Content-Type 을 믿지 않는다.** 확장자와 헤더는 보내는 쪽이 마음대로
 * 적을 수 있고, 브라우저는 내려받은 바이트를 보고 스스로 형식을 판단하는 일이
 * 있다. HTML 을 .png 라고 우겨 올린 뒤 그 주소를 열게 만드는 것이 고전적인
 * 수법이라, 내용 자체를 확인해야 한다.
 */
export function sniffImageType(bytes: Uint8Array): ImageContentType | null {
  const at = (i: number): number => bytes[i] ?? -1;

  // JPEG: FF D8 FF
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (PNG.every((b, i) => at(i) === b)) return 'image/png';

  // RIFF....WEBP — 컨테이너라 4~7바이트를 건너뛰고 확인해야 한다
  const riff = [0x52, 0x49, 0x46, 0x46].every((b, i) => at(i) === b);
  const webp = [0x57, 0x45, 0x42, 0x50].every((b, i) => at(8 + i) === b);
  if (riff && webp) return 'image/webp';

  // AVIF: 4~11바이트가 'ftypavif' (앞 4바이트는 박스 크기)
  const ftyp = [0x66, 0x74, 0x79, 0x70].every((b, i) => at(4 + i) === b);
  const avif = [0x61, 0x76, 0x69, 0x66].every((b, i) => at(8 + i) === b);
  if (ftyp && avif) return 'image/avif';

  return null;
}

/**
 * 업로드된 바이트를 검사한다. 통과하면 신뢰할 수 있는 형식을 돌려준다.
 *
 * 선언값이 아니라 **내용에서 알아낸 형식**을 돌려주는 것이 핵심이다.
 * 이 값으로 저장 키와 Content-Type 을 정해야 선언값을 믿지 않은 의미가 있다.
 */
export function verifyImageBytes(input: {
  bytes: Uint8Array;
  declaredType: string;
}): ImageContentType {
  if (input.bytes.byteLength === 0) throw new ImageError('EMPTY_FILE');
  if (input.bytes.byteLength > MAX_IMAGE_BYTES) throw new ImageError('TOO_LARGE');
  if (!isImageContentType(input.declaredType)) throw new ImageError('UNSUPPORTED_TYPE');

  const actual = sniffImageType(input.bytes);
  if (actual === null) throw new ImageError('CONTENT_MISMATCH');
  // 선언과 내용이 다르면 거절한다. 내용을 믿고 조용히 고쳐 주면
  // 무엇이 올라왔는지 아무도 모르게 된다.
  if (actual !== input.declaredType) throw new ImageError('CONTENT_MISMATCH');

  return actual;
}

/**
 * 저장 키.
 *
 * 사용자가 준 파일 이름을 쓰지 않는다. 경로 탈출(`../`), 한글·공백으로 인한
 * 인코딩 문제, 같은 이름끼리 덮어쓰는 사고가 전부 파일 이름에서 나온다.
 * 상품 id 아래에 임의 토큰으로 넣으면 셋 다 사라진다.
 */
export function imageObjectKey(input: {
  productId: string;
  contentType: ImageContentType;
  token: string;
}): string {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.token)) {
    throw new ImageError('CONTENT_MISMATCH');
  }
  return `products/${input.productId}/${input.token}.${EXTENSION[input.contentType]}`;
}

/**
 * 리뷰 사진의 객체 키.
 *
 * 접두사를 상품과 나눈다. 한 폴더에 섞으면 나중에 "리뷰 사진만 정리" 같은
 * 일을 할 수가 없고, 지금도 버킷을 열었을 때 무엇이 무엇인지 알 수 없다.
 *
 * **주문 항목 id 로 묶는다.** 리뷰는 주문 항목당 하나라서 이 값이 곧 그 리뷰의
 * 신원이고, 리뷰 id 를 쓰면 업로드 시점에 아직 존재하지 않는다.
 */
export function reviewImageObjectKey(input: {
  orderItemId: string;
  contentType: ImageContentType;
  token: string;
}): string {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(input.token)) {
    throw new ImageError('CONTENT_MISMATCH');
  }
  return `reviews/${input.orderItemId}/${input.token}.${EXTENSION[input.contentType]}`;
}

/**
 * 1:1 문의 사진의 저장 키. 쓴 사람 아래에 둔다 — 문의가 지워지거나 계정을 닫을 때 그 사람의 것을 한 번에 찾는다.
 * 파일 이름은 쓰지 않는다(경로 탈출·덮어쓰기). 토큰은 추측할 수 없게 — 비공개 문의의 사진도 주소는 공개 저장소에 있다.
 */
export function inquiryImageObjectKey(input: { authorId: string; contentType: ImageContentType; token: string }): string {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.token)) {
    throw new ImageError('CONTENT_MISMATCH');
  }
  return `inquiries/${input.authorId}/${input.token}.${EXTENSION[input.contentType]}`;
}

/**
 * 정렬 순서를 0,1,2… 로 다시 매긴다.
 *
 * 중간을 지우면 구멍이 생기고, 드래그로 옮기면 값이 겹친다. 겹친 채로 두면
 * 목록 쿼리의 대표 이미지가 요청마다 바뀐다 — 정렬이 결정적이지 않기 때문이다.
 */
export function resequence<T>(items: readonly T[]): { item: T; sortOrder: number }[] {
  return items.map((item, index) => ({ item, sortOrder: index }));
}

/**
 * 대체 텍스트 기본값.
 *
 * 비워 두면 스크린리더가 파일 이름을 읽거나 아무것도 읽지 않는다. 상품명과
 * 브랜드로 최소한의 문장을 만들어 두고, 운영자가 고칠 수 있게 한다.
 */
export function defaultAlt(input: {
  brandName: string;
  productName: string;
  index: number;
}): string {
  const base = `${input.brandName} ${input.productName}`;
  return input.index === 0 ? base : `${base} 상세 이미지 ${input.index}`;
}
