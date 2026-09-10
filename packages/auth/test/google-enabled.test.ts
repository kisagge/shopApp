import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';

/**
 * 건드린 키만 되돌린다.
 *
 * process.env 를 통째로 갈아 끼우면 Node 의 특수 객체가 평범한 객체로 바뀌어
 * 이후 대입이 다르게 동작한다. 같은 프로세스에서 도는 다른 테스트까지 말려든다.
 */
const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] as const;
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
});
