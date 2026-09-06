/**
 * 자리표시 그림.
 *
 * 큰 사진이 도착하기 전 그 자리에 깔아 두는 **아주 작은 같은 사진**이다.
 * 이 값은 이미지마다 HTML 에 실려 나가므로 **크기가 곧 비용**이다 —
 * 스물넷 짜리 격자면 스물넷 개가 첫 응답에 함께 간다.
 *
 * 그래서 형식을 고르는 기준이 화질이 아니라 바이트다. 같은 사진을 16px 로
 * 줄여 재 보면:
 *
 *     webp q45   143 B
 *     jpeg q45   411 B
 *
 * jpeg 는 양자화 표와 헤더가 붙박이로 들어가서, 사진이 아무리 작아져도
 * 그만큼은 줄지 않는다. 세 배를 스물넷 곱하면 6KB 차이다.
 */

/** 줄일 너비(px). 높이는 비율대로 따라간다. */
export const BLUR_WIDTH = 16;

/** webp 품질. 어차피 흐리게 깔리므로 더 올려도 눈에 닿지 않는다. */
export const BLUR_QUALITY = 45;

/**
 * 데이터 URI 길이 상한.
 *
 * **넘으면 두지 않는다.** 자리표시가 없으면 지금처럼 톤 블록이 깔릴 뿐이지만,
 * 큰 자리표시는 사진이 도착하기도 전에 첫 응답을 무겁게 만든다 — 빠르게
 * 보이려고 넣은 것이 느리게 만드는 셈이다.
 */
export const MAX_BLUR_DATA_URL = 400;

const PREFIX = 'data:image/webp;base64,';

/**
 * base64 를 데이터 URI 로. 상한을 넘으면 null 이다.
 *
 * 만들지 못하는 것과 두지 않기로 한 것을 같은 값(null)으로 돌려준다 —
 * 부르는 쪽에서 할 일이 둘 다 &ldquo;없이 간다&rdquo; 로 같기 때문이다.
 */
export function toBlurDataUrl(base64: string): string | null {
  if (base64.length === 0) return null;
  const uri = PREFIX + base64;
  return uri.length > MAX_BLUR_DATA_URL ? null : uri;
}

/**
 * 화면에 넘기기 전에 본다.
 *
 * 이 값은 DB 문자열이고 그대로 브라우저가 받아 오는 주소가 된다. 지금은
 * 우리가 쓴 것뿐이지만, 표의 문자열을 그대로 꽂는 자리는 나중에 어딘가에서
 * 바깥 주소가 들어온다 — 알림 링크에서 배운 것과 같은 자리다.
 * 확인하는 값이 붙이는 값보다 싸다.
 */
export function isBlurDataUrl(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  if (!value.startsWith(PREFIX)) return false;
  if (value.length > MAX_BLUR_DATA_URL) return false;
  return /^[A-Za-z0-9+/]+=*$/.test(value.slice(PREFIX.length));
}
