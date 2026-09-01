import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * 배포에서만 드러나는 설정 실수를 여기서 잡는다.
 *
 * 로컬 .env 에는 값이 다 있어서 문제가 안 보이다가, 환경변수가 비어 있는
 * 배포 환경에서만 깨지는 종류다. 실제로 shadowDatabaseUrl 이 빈 문자열이라
 * Vercel 빌드가 P1013 으로 죽었다.
 */
async function loadConfig(env: Record<string, string>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  // dotenv 는 이미 있는 값을 덮어쓰지 않으므로 stubEnv 가 이긴다
  const mod = await import('../prisma.config');
  return mod.default as { datasource: Record<string, unknown> };
}

const DB = 'postgresql://u:p@localhost:5432/db';

beforeEach(() => vi.unstubAllEnvs());
afterEach(() => vi.unstubAllEnvs());

describe('섀도 DB', () => {
  it('값이 없으면 키 자체를 넣지 않는다', async () => {
    // 빈 문자열을 넘기면 Prisma 가 P1013 으로 거절하는데,
    // 그 값을 쓰지도 않는 migrate deploy 까지 같이 죽는다.
    const config = await loadConfig({ SHADOW_DATABASE_URL: '', DATABASE_URL: DB });
    expect('shadowDatabaseUrl' in config.datasource).toBe(false);
  });

  it('값이 있으면 넣는다', async () => {
    const shadow = 'postgresql://u:p@localhost:5432/shadow';
    const config = await loadConfig({ SHADOW_DATABASE_URL: shadow, DATABASE_URL: DB });
    expect(config.datasource['shadowDatabaseUrl']).toBe(shadow);
  });
});

describe('연결 주소 우선순위', () => {
  it('직결 주소가 있으면 그것을 쓴다 — 풀러는 DDL 을 제대로 못 다룬다', async () => {
    const config = await loadConfig({
      DIRECT_DATABASE_URL: 'postgresql://u:p@direct/db',
      DATABASE_URL: 'postgresql://u:p@pooler/db',
      SHADOW_DATABASE_URL: '',
    });
    expect(config.datasource['url']).toBe('postgresql://u:p@direct/db');
  });

  it('Neon 의 DATABASE_URL_UNPOOLED 도 직결 주소로 받는다', async () => {
    const config = await loadConfig({
      DIRECT_DATABASE_URL: '',
      DATABASE_URL_UNPOOLED: 'postgresql://u:p@unpooled/db',
      DATABASE_URL: 'postgresql://u:p@pooler/db',
      SHADOW_DATABASE_URL: '',
    });
    // 빈 문자열도 "없음" 으로 봐야 한다 — ?? 를 쓰면 통과해 버린다
    expect(config.datasource['url']).toBe('postgresql://u:p@unpooled/db');
  });

  it('직결 주소가 없으면 풀링 주소로 떨어진다 — 로컬에는 풀러가 없다', async () => {
    const config = await loadConfig({
      DIRECT_DATABASE_URL: '', DATABASE_URL_UNPOOLED: '',
      DATABASE_URL: DB, SHADOW_DATABASE_URL: '',
    });
    expect(config.datasource['url']).toBe(DB);
  });
});
