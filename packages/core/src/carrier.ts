/**
 * 택배사와 송장 조회.
 *
 * 순수 함수만 둔다. I/O 없음.
 */

export const CARRIER_CODE = ['CJ', 'EPOST', 'HANJIN', 'LOTTE', 'LOGEN', 'ETC'] as const;
export type CarrierCode = (typeof CARRIER_CODE)[number];

export interface Carrier {
  readonly code: CarrierCode;
  readonly name: string;
  /**
   * 조회 주소. `{n}` 자리에 송장번호가 들어간다.
   *
   * **택배사 사정으로 바뀔 수 있는 값이다.** 그래서 화면은 이 링크에만
   * 기대지 않는다 — 송장번호를 늘 함께, 복사할 수 있게 보여 준다.
   * 링크가 깨져도 사용자가 번호를 들고 택배사 사이트로 갈 수 있어야 한다.
   *
   * null 이면 링크 없이 번호만 보여 준다.
   */
  readonly trackingUrl: string | null;
}

export const CARRIERS: readonly Carrier[] = [
  {
    code: 'CJ',
    name: 'CJ대한통운',
    trackingUrl: 'https://trace.cjlogistics.com/next/tracking.html?wblNo={n}',
  },
  {
    code: 'EPOST',
    name: '우체국택배',
    trackingUrl:
      'https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1={n}',
  },
  {
    code: 'HANJIN',
    name: '한진택배',
    trackingUrl:
      'https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillResult.do?mCode=MN038&schLang=KR&wblnumText2={n}',
  },
  {
    code: 'LOTTE',
    name: '롯데택배',
    trackingUrl: 'https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo={n}',
  },
  {
    code: 'LOGEN',
    name: '로젠택배',
    trackingUrl: 'https://www.ilogen.com/web/personal/trace/{n}',
  },
  {
    // 목록에 없는 택배사. 번호만 보여 주고 링크는 걸지 않는다 —
    // 어디로 보낼지 모르면서 링크를 거는 것보다 낫다.
    code: 'ETC',
    name: '기타',
    trackingUrl: null,
  },
];

const BY_CODE = new Map(CARRIERS.map((c) => [c.code, c]));

export const carrierOf = (code: string): Carrier | null => BY_CODE.get(code as CarrierCode) ?? null;

export const isCarrierCode = (code: string): code is CarrierCode =>
  (CARRIER_CODE as readonly string[]).includes(code);

/**
 * 송장번호에서 숫자만 남긴다.
 *
 * 사람들은 하이픈이나 공백을 넣어 옮겨 적는다. 저장은 한 모양이어야
 * 조회 링크를 만들 수 있고 나중에 번호로 찾을 수도 있다.
 */
export function normalizeTrackingNumber(value: string): string {
  return value.replace(/\D/g, '');
}

/**
 * 송장번호로 볼 만한 값인가.
 *
 * **자릿수를 택배사별로 못 박지 않는다.** 택배사마다 다르고 시간이 지나면
 * 바뀌기도 한다. 너무 좁게 잡으면 멀쩡한 번호를 거부해서 출고를 막는데,
 * 그건 링크 하나 깨지는 것보다 훨씬 나쁘다. 형식만 본다.
 */
export function isTrackingNumberLike(value: string): boolean {
  const digits = normalizeTrackingNumber(value);
  return digits.length >= 9 && digits.length <= 20;
}

/**
 * 조회 주소를 만든다. 만들 수 없으면 null.
 *
 * null 이면 화면은 번호만 보여 준다.
 */
export function trackingUrlFor(code: string, trackingNumber: string): string | null {
  const carrier = carrierOf(code);
  if (!carrier?.trackingUrl) return null;

  const digits = normalizeTrackingNumber(trackingNumber);
  if (digits.length === 0) return null;

  return carrier.trackingUrl.replace('{n}', encodeURIComponent(digits));
}

/** 보기 좋게 4자리씩 끊는다. 옮겨 적을 때 훨씬 덜 틀린다. */
export function formatTrackingNumber(value: string): string {
  const digits = normalizeTrackingNumber(value);
  return digits.replace(/(\d{4})(?=\d)/g, '$1-');
}
