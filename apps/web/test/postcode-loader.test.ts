// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DaumPostcodeData, PostcodeResult } from '~/lib/postcode';

/**
 * 주소 검색 스크립트를 불러오는 자리.
 *
 * **이 저장소가 이미 같은 모양으로 고장났다** — 배송지를 못 불러오면 화면이
 * 영원히 "불러오는 중" 이었고 빠져나갈 길도 없었다. 거기는 화면 쪽을 고쳤지만
 * 불러오는 자리 자체는 한 줄도 안 돌고 있었다(문장 27개 중 22개).
 *
 * 외부 스크립트라 광고 차단기·사내 네트워크에서 막힌다. 그때 **다시 시도할 수
 * 있는지**가 이 모듈의 전부다: 실패한 약속을 그대로 들고 있으면 새로 고치기 전까지
 * 주소 검색이 죽는다. `loading` 을 되돌리는 한 줄이 그것을 막는다.
 *
 * 모듈 범위의 약속을 보는 검사라 **파일마다 모듈을 새로 불러온다** — 한 검사의
 * 실패가 다음 검사에 남으면 무엇을 보고 있는지 알 수 없다.
 */

const SRC = 'https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js';

const load = async () => {
  vi.resetModules();
  return await import('~/lib/postcode');
};

const tags = () => [...document.head.querySelectorAll('script')];
/** 불러오기 성공·실패를 흉내 낸다 — jsdom 은 실제로 받아 오지 않는다 */
const settle = (kind: 'load' | 'error', index = 0) =>
  tags()[index]!.dispatchEvent(new Event(kind));

const DATA: DaumPostcodeData = {
  zonecode: '13494',
  roadAddress: '경기 성남시 분당구 판교역로 166',
  jibunAddress: '경기 성남시 분당구 백현동 532',
  buildingName: '카카오판교아지트',
  apartment: 'N',
  userSelectedType: 'R',
};

type Options = {
  oncomplete: (data: DaumPostcodeData) => void;
  onclose?: (state: string) => void;
  width?: string;
  height?: string;
};

/** 다음이 내놓는 생성자 흉내. 받은 설정과 어디에 끼웠는지를 남긴다 */
function fakeSdk() {
  const seen: { options?: Options; embedded?: HTMLElement } = {};
  function Postcode(this: { embed(el: HTMLElement): void }, options: Options) {
    seen.options = options;
    this.embed = (el: HTMLElement) => {
      seen.embedded = el;
    };
  }
  window.daum = { Postcode: Postcode as unknown as NonNullable<NonNullable<Window['daum']>['Postcode']> };
  return seen;
}

beforeEach(() => {
  document.head.replaceChildren();
  delete window.daum;
});

describe('스크립트를 붙이는 규칙', () => {
  it('처음 열면 비동기 script 하나를 붙인다', async () => {
    const { openPostcodeSearch } = await load();
    void openPostcodeSearch(document.createElement('div'), () => {});

    expect(tags()).toHaveLength(1);
    expect(tags()[0]!.src).toBe(SRC);
    expect(tags()[0]!.async).toBe(true);
  });

  it('이미 불러와 있으면 아무것도 붙이지 않는다', async () => {
    const seen = fakeSdk();
    const { openPostcodeSearch } = await load();
    const container = document.createElement('div');
    await openPostcodeSearch(container, () => {});

    expect(tags()).toHaveLength(0);
    expect(seen.embedded).toBe(container);
  });

  it('두 번 눌러도 script 는 하나다 — 둘이면 하나는 영원히 대기한다', async () => {
    const { openPostcodeSearch } = await load();
    const first = openPostcodeSearch(document.createElement('div'), () => {});
    const second = openPostcodeSearch(document.createElement('div'), () => {});

    expect(tags()).toHaveLength(1);

    fakeSdk();
    settle('load');
    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
  });
});

describe('못 불러왔을 때', () => {
  it('까닭을 들고 거절한다', async () => {
    const { openPostcodeSearch } = await load();
    const opening = openPostcodeSearch(document.createElement('div'), () => {});
    settle('error');

    await expect(opening).rejects.toThrow('주소 검색을 불러오지 못했습니다.');
  });

  it('다시 누르면 다시 붙인다 — 한 번 막혔다고 주소 검색이 죽으면 안 된다', async () => {
    /*
     * **실패한 약속을 그대로 들고 있으면 새로 고치기 전까지 영영 안 된다.**
     * 광고 차단기나 사내 네트워크는 잠깐 막기도 하므로, 두 번째 시도는 새
     * script 로 가야 한다.
     */
    const { openPostcodeSearch } = await load();
    const first = openPostcodeSearch(document.createElement('div'), () => {});
    settle('error');
    await expect(first).rejects.toThrow();

    const container = document.createElement('div');
    const second = openPostcodeSearch(container, () => {});
    expect(tags(), '두 번째 시도가 새 script 를 붙이지 않았다').toHaveLength(2);

    const seen = fakeSdk();
    settle('load', 1);
    await second;
    expect(seen.embedded).toBe(container);
  });

  it('스크립트는 왔는데 전역이 없으면 같은 말로 거절한다 — 차단기가 몸통만 비우기도 한다', async () => {
    const { openPostcodeSearch } = await load();
    const opening = openPostcodeSearch(document.createElement('div'), () => {});
    settle('load');

    await expect(opening).rejects.toThrow('주소 검색을 불러오지 못했습니다.');
  });
});

describe('펼칠 때 넘기는 것', () => {
  const open = async (onClose?: () => void) => {
    const seen = fakeSdk();
    const { openPostcodeSearch } = await load();
    const container = document.createElement('div');
    const picked: PostcodeResult[] = [];
    await openPostcodeSearch(container, (r) => picked.push(r), onClose);
    return { seen, container, picked };
  };

  it('팝업이 아니라 받은 자리에 끼워 넣고, 그 자리를 꽉 채운다', async () => {
    const { seen, container } = await open();

    expect(seen.embedded).toBe(container);
    expect(seen.options).toMatchObject({ width: '100%', height: '100%' });
  });

  it('고른 주소는 우리 모양으로 바꿔 넘긴다 — 아파트면 건물명까지', async () => {
    const { seen, picked } = await open();
    seen.options!.oncomplete({ ...DATA, apartment: 'Y' });

    expect(picked).toEqual([
      { postalCode: '13494', address: '경기 성남시 분당구 판교역로 166 (카카오판교아지트)' },
    ]);
  });

  it('닫는 일을 안 맡겼으면 onclose 를 아예 안 넘긴다', async () => {
    const { seen } = await open();

    expect(seen.options).not.toHaveProperty('onclose');
  });

  it('맡겼으면 다음이 주는 상태와 상관없이 그 일을 부른다', async () => {
    const onClose = vi.fn();
    const { seen } = await open(onClose);

    seen.options!.onclose!('FORCE_CLOSE');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledWith();
  });
});
