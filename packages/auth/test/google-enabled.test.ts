import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

/**
 * 건드린 키만 되돌린다.
 *
 * process.env 를 통째로 갈아 끼우면 Node 의 특수 객체가 평범한 객체로 바뀌어
 * 이후 대입이 다르게 동작한다. 같은 프로세스에서 도는 다른 테스트까지 말려든다.
 */
const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_IOS_CLIENT_ID'] as const;
const saved = new Map(KEYS.map((k) => [k, process.env[k]]));

const restore = () => {
  for (const k of KEYS) {
    const value = saved.get(k);
    if (value === undefined) delete process.env[k];
    else process.env[k] = value;
  }
};

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});
afterEach(restore);

const load = async () => (await import('../src/index')).googleEnabled;
const loadIds = async () => (await import('../src/index')).googleNativeClientIds;

/**
 * **처음 한 번의 import 값을 검사 밖에서 치른다.**
 *
 * 이 파일의 검사는 전부 0ms 인데 첫 번째만 660ms 였다 — 그 차이가 전부
 * `@shop/auth` 를 처음 불러오는 값이다(better-auth 와 어댑터가 딸려 온다).
 * 그게 검사 안에 있으면 상한을 그 값과 나눠 쓰게 되고, CI 처럼 부하가
 * 걸리면 **첫 검사만 시간 초과로 진다.** 실제로 그렇게 졌다.
 * 재는 것은 설정의 판단이지 모듈을 처음 읽는 속도가 아니다.
 */
beforeAll(async () => {
  await load();
  // 이 준비는 재는 대상이 아니다. 느린 기계에서도 끝나도록 넉넉히 준다 —
  // 훅의 기본 상한 10초로는 부하가 걸린 CI 에서 모자랐다.
}, 60_000);

describe('구글 로그인 켜짐 여부', () => {
  it('키가 없으면 꺼져 있다', async () => {
    expect((await load())()).toBe(false);
  });

  it('ID 만 있으면 꺼져 있다 — 반쯤 설정된 상태가 가장 나쁘다', async () => {
    // 켜면 사용자가 구글 화면까지 갔다가 오류를 받는다
    process.env['GOOGLE_CLIENT_ID'] = 'id';
    expect((await load())()).toBe(false);
  });

  it('시크릿만 있어도 꺼져 있다', async () => {
    process.env['GOOGLE_CLIENT_SECRET'] = 'secret';
    expect((await load())()).toBe(false);
  });

  it('둘 다 있으면 켜진다', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'secret';
    expect((await load())()).toBe(true);
  });

  it('빈 문자열은 없는 것으로 본다', async () => {
    process.env['GOOGLE_CLIENT_ID'] = '';
    process.env['GOOGLE_CLIENT_SECRET'] = '';
    expect((await load())()).toBe(false);
  });

  it('공백만 든 값도 없는 것으로 본다', async () => {
    /*
     * **빈 칸과 공백 한 칸은 사람 손에서 같은 일이다.** 구글 콘솔에서 복사해
     * 대시보드 칸에 붙이면 앞뒤 공백이 딸려 온다. 그런데 공백은 빈 문자열과
     * 달리 truthy 라, 여기가 켜졌다고 말하고 화면에 단추가 섰다 — 누른 사람은
     * 구글 쪽 오류 화면까지 갔다 온다.
     */
    process.env['GOOGLE_CLIENT_ID'] = '  ';
    process.env['GOOGLE_CLIENT_SECRET'] = '\t\n';
    expect((await load())()).toBe(false);
  });

  it('값에 붙은 공백은 떼고 쓴다', async () => {
    process.env['GOOGLE_CLIENT_ID'] = ' id ';
    process.env['GOOGLE_CLIENT_SECRET'] = ' secret ';
    expect((await load())()).toBe(true);
  });
});

/**
 * 셸에 넘겨줄 클라이언트 ID.
 *
 * 이 함수에는 검사가 하나도 없었다. 규칙은 둘이다 — **둘 다 있을 때만** 넘긴다
 * (iOS 는 전용 ID 가 없으면 계정 선택이 아예 안 뜨고, 반쯤 넘기면 앱에서 단추가
 * 아무 일도 안 하는 것처럼 보인다), 그리고 비밀이 아니어서 화면으로 내려도 된다.
 */
describe('네이티브에 넘길 구글 클라이언트 ID', () => {
  it('둘 다 있으면 둘 다 넘긴다', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'web-id';
    process.env['GOOGLE_IOS_CLIENT_ID'] = 'ios-id';
    expect((await loadIds())()).toEqual({ webClientId: 'web-id', iosClientId: 'ios-id' });
  });

  it('iOS 것이 없으면 아무것도 넘기지 않는다', async () => {
    // 반쯤 넘기면 iOS 에서 계정 선택이 안 뜨고, 그 까닭이 화면에 안 남는다
    process.env['GOOGLE_CLIENT_ID'] = 'web-id';
    expect((await loadIds())()).toBeNull();
  });

  it('웹 것이 없으면 아무것도 넘기지 않는다', async () => {
    // 안드로이드가 쓰는 값이다 — 없으면 안드로이드에서 뜨지 않는다
    process.env['GOOGLE_IOS_CLIENT_ID'] = 'ios-id';
    expect((await loadIds())()).toBeNull();
  });

  it('둘 다 없으면 아무것도 넘기지 않는다', async () => {
    expect((await loadIds())()).toBeNull();
  });

  it('공백만 든 값은 없는 것으로 본다', async () => {
    process.env['GOOGLE_CLIENT_ID'] = 'web-id';
    process.env['GOOGLE_IOS_CLIENT_ID'] = ' ';
    expect((await loadIds())()).toBeNull();
  });

  it('붙은 공백은 떼고 넘긴다', async () => {
    /*
     * 다듬지 않고 넘기면 플러그인이 그 글자로 구글을 부르고, 계정 선택이
     * 뜨지 않는다. 기기를 꺼내 보기 전에는 모른다.
     */
    process.env['GOOGLE_CLIENT_ID'] = ' web-id\n';
    process.env['GOOGLE_IOS_CLIENT_ID'] = '\tios-id ';
    expect((await loadIds())()).toEqual({ webClientId: 'web-id', iosClientId: 'ios-id' });
  });
});
