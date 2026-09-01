import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { authorizeCron, CRON_ACTOR } from '~/lib/cron';

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/x', {
    headers: auth === undefined ? {} : { authorization: auth },
  });

const SECRET = 'aVeryLongCronSecretValue123456==';

beforeEach(() => { vi.stubEnv('CRON_SECRET', SECRET); });
afterEach(() => { vi.unstubAllEnvs(); });

describe('시크릿이 없을 때', () => {
  it('열어 두지 않고 막는다', () => {
    // 설정을 빠뜨렸을 때 조용히 무방비가 되는 쪽이 훨씬 나쁘다
    vi.stubEnv('CRON_SECRET', '');
    const result = authorizeCron(req(`Bearer ${SECRET}`));
    expect(result).toMatchObject({ ok: false, status: 503, code: 'CRON_NOT_CONFIGURED' });
  });
});

describe('토큰 검사', () => {
  it('맞는 토큰이면 통과한다', () => {
    const result = authorizeCron(req(`Bearer ${SECRET}`));
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.actor).toEqual(CRON_ACTOR);
  });

  it.each([
    ['헤더 없음', undefined],
    ['Bearer 없음', SECRET],
    ['빈 토큰', 'Bearer '],
    ['틀린 토큰', 'Bearer wrong-value-of-same-length-x'],
    ['접두사만 맞음', `Bearer ${SECRET.slice(0, 10)}`],
    ['뒤에 덧붙임', `Bearer ${SECRET}extra`],
    ['다른 스킴', `Basic ${SECRET}`],
  ])('%s 은 거절한다', (_label, header) => {
    expect(authorizeCron(req(header))).toMatchObject({ ok: false, status: 401 });
  });
});

describe('배치 행위자', () => {
  it('사람과 구분되는 id 를 쓴다 — 감사 로그에서 누가 했는지 헷갈리면 안 된다', () => {
    expect(CRON_ACTOR.id).toBe('system:cron');
    expect(CRON_ACTOR.merchantId).toBeNull();
  });

  it('정산 확정과 지급에 필요한 권한을 갖는다', async () => {
    const { hasPermission } = await import('@shop/core');
    expect(hasPermission(CRON_ACTOR, 'settlement:confirm')).toBe(true);
    expect(hasPermission(CRON_ACTOR, 'user:write')).toBe(true);
  });
});
