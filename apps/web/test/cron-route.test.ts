import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const recordAudit = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/audit', () => ({ recordAudit }));

const { cronRoute, CRON_ACTOR } = await import('~/lib/cron');

const SECRET = 'aVeryLongCronSecretValue123456==';
const req = (auth = `Bearer ${SECRET}`) =>
  new Request('http://localhost/api/cron/x', { headers: { authorization: auth } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', SECRET);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/**
 * 배치 라우트의 뼈대.
 *
 * 일곱 개가 문지기 네 줄을 각자 적고 있었다. 한 곳으로 모은 김에, **감싸개가
 * 실제로 문을 잠그는지**를 여기서 본다 — 라우트마다 확인할 수 없는 것을 감싸개
 * 하나에서 확인하는 것이 이 모양의 값이다.
 */
describe('배치 감싸개', () => {
  it('통과하면 배치를 돌리고 몸통을 그대로 싣는다', async () => {
    const run = vi.fn().mockResolvedValue({ body: { confirmed: 2 } });

    const res = await cronRoute('test.ok', run)(req());

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ confirmed: 2 });
    expect(run).toHaveBeenCalledWith(CRON_ACTOR);
  });

  it('토큰이 틀리면 배치를 아예 돌리지 않는다', async () => {
    const run = vi.fn().mockResolvedValue({ body: {} });

    const res = await cronRoute('test.401', run)(req('Bearer wrong-value-of-same-length-x'));

    expect(res.status).toBe(401);
    expect(run, '문지기를 지나기 전에 배치가 돌면 문이 없는 것과 같다').not.toHaveBeenCalled();
  });

  it('시크릿이 없으면 열어 두지 않고 막는다', async () => {
    vi.stubEnv('CRON_SECRET', '');
    const run = vi.fn().mockResolvedValue({ body: {} });

    const res = await cronRoute('test.503', run)(req());

    expect(res.status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });

  it('남길 것을 주면 행위자와 요청을 붙여 남긴다', async () => {
    const run = vi.fn().mockResolvedValue({
      body: { total: 100 },
      audits: [{ action: 'points.expire', targetType: 'user', targetId: '3명', after: { total: 100 } }],
    });

    await cronRoute('points.expire', run)(req());

    expect(recordAudit).toHaveBeenCalledTimes(1);
    expect(recordAudit.mock.calls[0]![0]).toMatchObject({
      actor: CRON_ACTOR,
      action: 'points.expire',
      targetId: '3명',
    });
    expect(recordAudit.mock.calls[0]![0].request, '요청을 안 넘기면 IP 가 안 남는다').toBeInstanceOf(Request);
  });

  it('남길 것이 없는 날은 아무것도 안 남긴다', async () => {
    // 0건인 날까지 남기면 정작 봐야 할 줄이 잡음에 묻힌다
    await cronRoute('test.quiet', vi.fn().mockResolvedValue({ body: {}, audits: [] }))(req());

    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('여러 줄을 남길 수도 있다 — 하루치 정리는 두 가지를 지운다', async () => {
    const run = vi.fn().mockResolvedValue({
      body: {},
      audits: [
        { action: 'event.prune', targetType: 'event_log', targetId: '2026-09-01', after: {} },
        { action: 'notification.prune', targetType: 'notification', targetId: 'retention', after: {} },
      ],
    });

    await cronRoute('event.rollup', run)(req());

    expect(recordAudit.mock.calls.map((c) => c[0].action)).toEqual([
      'event.prune', 'notification.prune',
    ]);
  });

  /**
   * **넘어진 것은 로그에 남아야 한다.** 배치는 보는 사람이 없어서, 조용히 실패하면
   * 아무도 모른 채 며칠이 지난다 — 정산 확정이 그렇게 멈추면 그달 지급이 통째로 밀린다.
   */
  it('상태를 아는 실패는 그 상태로 돌려보내고 로그에 남긴다', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn().mockRejectedValue({ status: 409, code: 'ALREADY_PAID', message: '이미 지급했습니다.' });

    const res = await cronRoute('settlement.close', run)(req());

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ code: 'ALREADY_PAID', message: '이미 지급했습니다.' });
    expect(error).toHaveBeenCalled();
    expect(String(error.mock.calls[0]![0])).toContain('settlement.close');
  });

  it('모르는 고장은 삼키지 않는다 — 200 으로 덮으면 고장이 안 보인다', async () => {
    const run = vi.fn().mockRejectedValue(new Error('DB 가 안 열린다'));

    await expect(cronRoute('test.boom', run)(req())).rejects.toThrow('DB 가 안 열린다');
    expect(recordAudit).not.toHaveBeenCalled();
  });
});
