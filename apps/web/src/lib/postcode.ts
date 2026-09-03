/**
 * 다음 우편번호 서비스.
 *
 * 우편번호를 손으로 치게 두면 사람들은 대개 모른다. 실제 쇼핑몰은 전부
 * 주소 검색을 붙이고, 이 서비스는 키도 가입도 없이 쓸 수 있다.
 *
 * **직접 입력을 없애지 않는다.** 외부 스크립트라 광고 차단기나 사내
 * 네트워크에서 막힐 수 있고, 그러면 주소를 넣을 방법이 통째로 사라진다.
 * 검색은 편의로 얹고, 못 불러오면 조용히 손 입력만 남는다.
 */

const SDK_SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

export interface PostcodeResult {
  /** 5자리 우편번호 */
  readonly postalCode: string;
  /** 도로명 주소. 없으면 지번 주소 */
  readonly address: string;
}

/** 다음이 돌려주는 것 중 우리가 쓰는 것만 */
export interface DaumPostcodeData {
  zonecode: string;
  roadAddress: string;
  jibunAddress: string;
  buildingName: string;
  apartment: string;
  userSelectedType: 'R' | 'J';
}

interface DaumPostcodeConstructor {
  new (options: {
    oncomplete: (data: DaumPostcodeData) => void;
    onclose?: (state: string) => void;
    width?: string;
    height?: string;
  }): { embed(element: HTMLElement): void };
}

declare global {
  interface Window {
    daum?: { Postcode?: DaumPostcodeConstructor };
  }
}

/**
 * 다음이 준 것을 우리 모양으로 옮긴다.
 *
 * 따로 뺀 이유는 여기가 틀리기 쉬운 자리이기 때문이다 — 도로명과 지번 중
 * 무엇을 쓸지, 건물명을 붙일지. iframe 을 몰아서 확인하기 어려운 로직이라
 * 순수 함수로 두고 테스트한다.
 */
export function toPostcodeResult(data: DaumPostcodeData): PostcodeResult {
  // 사용자가 도로명·지번 중 무엇을 골랐는지 따른다. 도로명을 강제하면
  // 지번으로 찾은 사람에게 낯선 주소가 들어간다.
  const base = data.userSelectedType === 'J' ? data.jibunAddress : data.roadAddress;

  // 아파트면 건물명을 붙인다. "래미안 1차" 같은 것이 있어야 기사가 찾는다.
  // 아파트가 아닌 건물명(상가 이름 등)은 붙이지 않는다 — 주소가 길어지기만 한다.
  const address =
    data.apartment === 'Y' && data.buildingName ? `${base} (${data.buildingName})` : base;

  return { postalCode: data.zonecode, address };
}

let loading: Promise<void> | null = null;

function loadSdk(): Promise<void> {
  if (window.daum?.Postcode) return Promise.resolve();
  // 두 번 누르면 script 태그가 두 개 붙고 그중 하나는 영원히 대기한다
  if (loading) return loading;

  loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null; // 다음 시도에서 다시 붙일 수 있게 되돌린다
      reject(new Error('주소 검색을 불러오지 못했습니다.'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * 주소 검색을 주어진 자리에 펼친다.
 *
 * 팝업이 아니라 **페이지 안에 끼워 넣는다.** 팝업은 차단되기 일쑤고,
 * 차단되면 아무 일도 일어나지 않아서 사용자는 버튼이 고장 난 줄 안다.
 */
export async function openPostcodeSearch(
  container: HTMLElement,
  onComplete: (result: PostcodeResult) => void,
  onClose?: () => void,
): Promise<void> {
  await loadSdk();
  const Postcode = window.daum?.Postcode;
  if (!Postcode) throw new Error('주소 검색을 불러오지 못했습니다.');

  new Postcode({
    oncomplete: (data) => onComplete(toPostcodeResult(data)),
    ...(onClose ? { onclose: () => onClose() } : {}),
    width: '100%',
    height: '100%',
  }).embed(container);
}
