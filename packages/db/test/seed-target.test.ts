import { describe, it, expect, afterEach } from 'vitest';
import { assertSeedTarget, isLocalDatabase, SEED_REMOTE_FLAG } from '../src/seed-target';

/**
 * 시드가 어느 DB 에 쓰는지 밝히는 관문.
 *
 * **마이그레이션에는 있고 시드에는 없었다.** `db:deploy` 는 대상 호스트를
 * 찍어 주는데 시드는 "시드 시작" 하고 곧바로 쓴다 — 어디에 썼는지는 다 쓴
 * 뒤에도 알 수 없었다.
 *
 * 원격에 시드하는 것 자체는 정상이다. 매대를 채우려면 그래야 한다. 다만
 * **실수로 그러는 것과 그러려고 하는 것은 다르다** — 셸에 주소를 하나 남겨
 * 두었다가 다른 명령을 돌리면 그 사이에 아무 경고도 없다.
 */

const KEEP = { ...process.env };
afterEach(() => {
  process.env = { ...KEEP };
});

function target(url: string | undefined, approved = false): void {
  if (url === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = url;
  if (approved) process.env[SEED_REMOTE_FLAG] = 'yes';
  else delete process.env[SEED_REMOTE_FLAG];
  assertSeedTarget('시드');
}

describe('내 기계인지 가리기', () => {
  it.each(['localhost', '127.0.0.1', '::1'])('%s 는 내 기계다', (host) => {
    const url = host === '::1' ? 'postgresql://u:p@[::1]:5432/db' : `postgresql://u:p@${host}:5432/db`;
    expect(isLocalDatabase(url)).toBe(true);
  });

  it('그 밖은 원격으로 본다', () => {
    expect(isLocalDatabase('postgresql://u:p@x.neon.tech:5432/db')).toBe(false);
  });

  it('형식을 모르면 원격으로 본다 — 모를 때 느슨한 쪽으로 기울지 않는다', () => {
    expect(isLocalDatabase('이건 주소가 아니다')).toBe(false);
  });
});

describe('시드 관문', () => {
  it('내 기계면 그냥 지나간다', () => {
    expect(() => target('postgresql://shop:shop@localhost:5432/shop')).not.toThrow();
  });

  it('원격인데 승인이 없으면 막는다', () => {
    expect(() => target('postgresql://u:p@x.neon.tech:5432/db')).toThrow(/내 기계가 아닙니다/);
  });

  it('막을 때 어떻게 켜는지 알려 준다', () => {
    // "안 된다" 만 말하면 무엇을 해야 하는지 찾으러 가야 한다
    expect(() => target('postgresql://u:p@x.neon.tech:5432/db')).toThrow(
      new RegExp(`${SEED_REMOTE_FLAG}=yes`),
    );
  });

  it('승인하면 지나간다', () => {
    expect(() => target('postgresql://u:p@x.neon.tech:5432/db', true)).not.toThrow();
  });

  it('주소가 없으면 막는다', () => {
    expect(() => target(undefined)).toThrow(/DATABASE_URL/);
  });
});

describe('자격증명은 로그에 남기지 않는다', () => {
  it('막을 때 비밀번호를 찍지 않는다', () => {
    /*
     * 로그는 남고, 남은 것은 누군가 본다. 여기서 한 번 새면 되돌릴 방법이 없다.
     */
    let message = '';
    try {
      target('postgresql://admin:hunter2@x.neon.tech:5432/db');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('x.neon.tech');
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('admin');
  });

  it('지나갈 때도 찍지 않는다', () => {
    const said: string[] = [];
    const keep = console.log;
    console.log = (...a: unknown[]) => void said.push(a.join(' '));
    try {
      target('postgresql://admin:hunter2@x.neon.tech:5432/db', true);
    } finally {
      console.log = keep;
    }
    expect(said.join('\n')).toContain('x.neon.tech');
    expect(said.join('\n')).not.toContain('hunter2');
  });
});

/**
 * **형식을 알 수 없는 주소.**
 *
 * `isLocalDatabase` 가 모르는 형식을 원격으로 보는 것은 이미 못 박혀 있다(위). 빠져
 * 있던 것은 **그때 로그에 무엇을 적는가**다 — 호스트를 뽑는 자리도 같은 주소를 파싱하고,
 * 거기서 던지면 관문이 "원격이라 막는다" 가 아니라 **파싱 오류로** 터진다. 운영자는
 * 승인 깃발을 켜도 같은 오류를 다시 보게 되고 무엇이 문제인지 알 수 없다.
 *
 * 그래서 못 뽑으면 자리를 글로 채운다. 주소를 그대로 적지는 않는다 — 형식을 모르는
 * 글자에 자격증명이 섞여 있을 수 있고, 로그는 남는다.
 */
describe('형식을 알 수 없는 주소', () => {
  it('원격으로 막으면서 모르는 형식이라고 적는다', () => {
    let message = '';
    try {
      target('postgres-주소를-잘못-붙였다');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('(형식을 알 수 없는 주소)');
    // 막는 까닭은 그대로 알려 준다 — 켜는 방법까지
    expect(message).toContain(SEED_REMOTE_FLAG);
  });

  it('주소 글자를 로그에 옮기지 않는다', () => {
    let message = '';
    try {
      target('oops://admin:hunter2@@@');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toContain('hunter2');
  });

  /** 승인하고 돌리면 지나간다 — 모르는 형식이라고 길을 막아 두지는 않는다 */
  it('승인하면 지나가고, 그때도 모르는 형식이라고 적는다', () => {
    const said: string[] = [];
    const keep = console.log;
    console.log = (...a: unknown[]) => void said.push(a.join(' '));
    try {
      expect(() => target('postgres-주소를-잘못-붙였다', true)).not.toThrow();
    } finally {
      console.log = keep;
    }
    expect(said.join('\n')).toContain('(형식을 알 수 없는 주소)');
  });
});
