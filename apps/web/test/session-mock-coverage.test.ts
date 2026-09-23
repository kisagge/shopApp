import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 세션 모듈을 흉내 낼 때는 **창구를 전부 낸다.**
 *
 * **왜 이 검사가 생겼는가.** `vi.mock('@shop/auth/session', () => ({ getActor }))` 는
 * 모듈을 그 한 export 로 바꾼다. 그래서 검사 대상이 옆에 있는 `getSessionUser` 를
 * 쓰기 시작하면, 그 라우트와 아무 상관 없는 검사 파일 서른 개가 한꺼번에
 * `undefined is not a function` 으로 진다 — 원인은 라우트 한 줄인데 실패는 서른 곳이다.
 *
 * 실제로 이미 갈려 있었다: 스물두 파일은 `getActor` 만, 열한 파일은 `getSessionUser` 만,
 * 한 파일만 둘 다 적어 두고 있었다.
 *
 * 그래서 흉내는 support/session-mock 하나에서 낸다. 세션 모듈에 창구가 하나 더 생겨도
 * 고칠 곳은 그 파일이다.
 */
const TEST_DIR = process.cwd() + '/test';
const AUTH_SRC = join(process.cwd(), '..', '..', 'packages', 'auth', 'src', 'session-user.ts');

const files = readdirSync(TEST_DIR)
  .filter((name) => name.endsWith('.test.ts') || name.endsWith('.test.tsx'))
  .map((name) => ({ name, source: readFileSync(join(TEST_DIR, name), 'utf8') }));

// 이 검사 파일 자신은 뺀다 — 위 설명과 아래 정규식에 같은 문구가 들어 있다
const mockers = files
  .filter((f) => f.name !== 'session-mock-coverage.test.ts')
  .filter((f) => f.source.includes("vi.mock('@shop/auth/session'"));

describe('세션 흉내', () => {
  it('흉내 내는 파일을 실제로 찾았다', () => {
    expect(mockers.length).toBeGreaterThan(20);
  });

  it.each(mockers.map((m) => m.name))('%s 는 공용 흉내를 쓴다', (name) => {
    const file = mockers.find((m) => m.name === name)!;
    expect(
      /vi\.mock\('@shop\/auth\/session', \(\) => \w+\);/.test(file.source),
      `${name} 이 세션 모듈을 손으로 흉내 낸다. support/session-mock 의 sessionMock() 을 쓰면 ` +
        '세션에 창구가 하나 더 생겨도 이 파일은 안 깨진다.',
    ).toBe(true);
  });

  /**
   * 공용 흉내가 **실제 모듈만큼 내는지** 본다. 여기가 빠지면 공용으로 모아 둔 의미가 없다 —
   * 창구가 하나 늘었는데 흉내가 그대로면, 그날 서른 파일이 함께 진다.
   */
  it('세션 모듈이 내보내는 창구를 빠짐없이 흉내 낸다', async () => {
    const source = readFileSync(AUTH_SRC, 'utf8');
    const exported = [...source.matchAll(/^export async function (\w+)/gm)].map((m) => m[1]!);
    const { sessionMock } = await import('./support/session-mock');
    const faked = Object.keys(sessionMock());

    expect(exported.length, '세션 모듈에서 창구를 못 읽었다').toBeGreaterThan(1);
    expect(
      exported.filter((name) => !faked.includes(name)),
      'support/session-mock 에 없는 창구가 있다 — 그것을 쓰는 라우트가 나오면 검사가 무더기로 진다.',
    ).toEqual([]);
  });
});

/**
 * 캐시 모듈도 같은 함정을 밟았다.
 *
 * `vi.mock('~/lib/cache', () => ({ revalidateCatalog }))` 는 모듈을 그 하나로 바꾼다.
 * **배송 정책에 캐시를 씌우자마자** 그 파일에 닿는 검사들이 "No cachedRead export" 로
 * 졌다 — 원인은 그 검사들과 아무 상관 없는 다른 파일이었다. 세션과 같은 모양이라
 * 같은 방식으로 막는다.
 */
/**
 * 캐시 감싸개에 **무엇을 건넸는지** 보는 검사는 예외다. 태그와 수명이 이 검사의 관심사라,
 * 공용 흉내처럼 그냥 통과시키면 볼 것이 없어진다.
 */
const CACHE_BY_HAND: Readonly<Record<string, string>> = {
  'shipping-policy-cache.test.ts': 'cachedRead 에 건넨 태그와 수명을 본다',
};

const cacheMockers = files
  .filter((f) => f.name !== 'session-mock-coverage.test.ts')
  .filter((f) => !(f.name in CACHE_BY_HAND))
  .filter((f) => f.source.includes("vi.mock('~/lib/cache'"));

describe('캐시 흉내', () => {
  it('흉내 내는 파일을 실제로 찾았다', () => {
    expect(cacheMockers.length).toBeGreaterThan(10);
  });

  it.each(cacheMockers.map((m) => m.name))('%s 는 공용 흉내를 쓴다', (name) => {
    const file = cacheMockers.find((m) => m.name === name)!;
    expect(
      /vi\.mock\('~\/lib\/cache', \(\) => \w+\);/.test(file.source),
      `${name} 이 캐시 모듈을 손으로 흉내 낸다. support/cache-mock 의 cacheMock() 을 쓰면 ` +
        '캐시에 창구가 하나 더 생겨도 이 파일은 안 깨진다.',
    ).toBe(true);
  });

  it('예외 목록에 죽은 줄이 없다 — 고친 뒤 남겨 두면 다음 사람이 믿는다', () => {
    const stale = Object.keys(CACHE_BY_HAND).filter(
      (name) => !files.some((f) => f.name === name && f.source.includes("vi.mock('~/lib/cache'")),
    );
    expect(stale, `이제 손으로 흉내 내지 않는다: ${stale.join(', ')}`).toEqual([]);
  });

  it('캐시 모듈이 내보내는 것을 빠짐없이 흉내 낸다', async () => {
    const source = readFileSync(join(process.cwd(), 'src', 'lib', 'cache.ts'), 'utf8');
    const exported = [...source.matchAll(/^export (?:const|function) (\w+)/gm)].map((m) => m[1]!);
    const { cacheMock } = await import('./support/cache-mock');
    const faked = Object.keys(cacheMock());

    expect(exported.length, '캐시 모듈에서 창구를 못 읽었다').toBeGreaterThan(5);
    expect(
      exported.filter((name) => !faked.includes(name)),
      'support/cache-mock 에 없는 창구가 있다 — 그것을 쓰는 파일이 나오면 검사가 무더기로 진다.',
    ).toEqual([]);
  });
});
