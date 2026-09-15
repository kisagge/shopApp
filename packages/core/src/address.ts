/**
 * 배송지 정책.
 *
 * 여기 있는 것은 전부 순수 함수다. I/O 없음.
 */

/**
 * 도서산간 우편번호 구간.
 *
 * 택배사마다 표가 조금씩 다르고 섬 단위로 더 잘게 나뉘지만, 여기서는
 * 사람들이 실제로 마주치는 큰 구간만 다룬다. 실제 서비스라면 택배사가 주는
 * 표를 받아 와야 한다 — 그때도 **판정 자리는 여기 하나**여야 한다.
 */
const REMOTE_RANGES: readonly { from: number; to: number; label: string }[] = [
  { from: 63000, to: 63644, label: '제주특별자치도' },
  { from: 40200, to: 40240, label: '울릉군' },
  { from: 23100, to: 23136, label: '인천 옹진군 도서' },
];

export const POSTAL_CODE_PATTERN = /^\d{5}$/;

/**
 * 이 우편번호가 도서산간인가.
 *
 * **사용자에게 물어보지 않는다.** 추가 배송비가 걸린 값이라 체크박스로 두면
 * 제주에 사는 사람이 체크를 풀고 3,000원을 아끼게 된다. 주소를 저장할 때
 * 서버가 우편번호에서 정한다.
 *
 * 형식이 아니면 false 다. 판정할 수 없는 값에 추가 요금을 물리면 안 된다 —
 * 우편번호 검증은 입력 단계에서 따로 한다.
 */
export function isRemoteAreaPostalCode(postalCode: string): boolean {
  return remoteAreaLabel(postalCode) !== null;
}

/** 도서산간이면 그 지역 이름, 아니면 null. 화면에서 이유를 설명할 때 쓴다. */
export function remoteAreaLabel(postalCode: string): string | null {
  const trimmed = postalCode.trim();
  if (!POSTAL_CODE_PATTERN.test(trimmed)) return null;

  const code = Number(trimmed);
  return REMOTE_RANGES.find((r) => code >= r.from && code <= r.to)?.label ?? null;
}

/**
 * 휴대폰 번호를 하이픈 있는 형태로 통일한다.
 *
 * 입력은 제각각이지만(01012345678, 010 1234 5678) 저장과 표시는 한 가지여야
 * 한다. 같은 번호가 두 모양으로 저장되면 사람이 목록에서 중복을 못 알아본다.
 */
/** 휴대폰 번호. 배송지 연락처와 회원 연락처가 같은 규칙을 쓴다 */
export const PHONE_PATTERN = /^01[016789][-\s]?\d{3,4}[-\s]?\d{4}$/;

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return phone.trim();
}

/** 한 사람이 저장할 수 있는 배송지 수 */
export const MAX_ADDRESSES = 10;
