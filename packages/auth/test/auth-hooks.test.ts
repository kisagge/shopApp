import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * better-auth 설정 안쪽의 훅들.
 *
 * **도움 함수는 붙들려 있는데 그것을 부르는 자리가 비어 있었다.** `assertNotSuspended` 와
 * `assertProfileUpdate` 는 각각 검사가 있지만, **훅이 그 함수를 실제로 부르는지**는 아무도
 * 안 봤다 — 268줄의 호출을 지워도 `suspension.test.ts` 는 그대로 초록이고, 정지된 계정은
 * 세션을 계속 받는다. 가입 포인트와 메일 둘도 같은 자리였다(커버리지 13줄).
 *
 * 훅은 `options` 안에 있고 `options` 는 내보내지 않는다. 그래서 **`betterAuth` 에 넘기는
 * 설정을 가로챈다** — 그것이 곧 better-auth 가 요청마다 부르는 규칙이다.
 */

interface Hooks {
  readonly emailAndPassword: {
    sendResetPassword(ctx: { user: { id: string; email: string; name: string }; url: string }, request?: Request): Promise<void>;
  };
  readonly emailVerification: {
    sendVerificationEmail(ctx: { user: { id: string; email: string; name: string }; url: string }, request?: Request): Promise<void>;
  };
  readonly databaseHooks: {
    readonly session: { readonly create: { before(session: { userId: string }): Promise<void> } };
    readonly user: {
      readonly update: { before(data: Record<string, unknown>): Promise<void> };
      readonly create: { after(user: { id: string; email: string; name: string }, ctx?: { headers?: Headers }): Promise<void> };
    };
  };
}

const captured = vi.hoisted(() => {
  const state: { options: Hooks | undefined } = { options: undefined };
  return state;
});
vi.mock('better-auth', () => ({
  betterAuth: (options: Hooks) => {
    captured.options = options;
    return { api: {} };
  },
}));
vi.mock('better-auth/adapters/prisma', () => ({ prismaAdapter: () => ({}) }));
vi.mock('better-auth/plugins', () => ({ bearer: () => ({}) }));
vi.mock('better-auth/cookies', () => ({
  getCookies: () => ({ sessionToken: { name: 'session', attributes: {} } }),
}));

const db = vi.hoisted(() => ({
  user: { findUnique: vi.fn<(...a: any[]) => any>(), update: vi.fn<(...a: any[]) => any>() },
  pointTransaction: { create: vi.fn<(...a: any[]) => any>() },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db, Prisma: {} }));

const send = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('@shop/mail', () => ({ getMailer: () => ({ send }) }));

const suspension = vi.hoisted(() => ({ assertNotSuspended: vi.fn<(...a: any[]) => any>() }));
vi.mock('../src/suspension', () => suspension);
const profile = vi.hoisted(() => ({ assertProfileUpdate: vi.fn<(...a: any[]) => any>() }));
vi.mock('../src/profile', () => profile);

const { auth } = await import('../src/index');
const { SIGNUP_POINTS, rewardExpiresAt } = await import('@shop/core');
const { createTranslator } = await import('@shop/i18n/all');

// 게으른 인스턴스를 깨워야 설정이 넘어간다 — 그 게으름에도 까닭이 있다(index.ts 주석)
void auth.api;

const options = captured.options;
// 가로채기가 헛돌면 아래 검사들이 조용히 통과한다 — 여기서 끝낸다
if (options === undefined) throw new Error('betterAuth 에 설정이 넘어가지 않았다');

const user = { id: 'u-1', email: 'a@plain.test', name: '김손님' };

beforeEach(() => {
  vi.clearAllMocks();
  db.user.findUnique.mockResolvedValue(null);
  db.user.update.mockResolvedValue({});
  db.$transaction.mockResolvedValue([]);
  send.mockResolvedValue(undefined);
  suspension.assertNotSuspended.mockResolvedValue(undefined);
});

/**
 * **메일 둘은 반대로 실패한다 — 일부러 그렇다.**
 *
 * 재설정 메일은 **그 메일이 곧 목적**이다. 발송이 실패했는데 창구가 성공이라고 답하면
 * 사람은 오지 않는 메일을 기다린다. 그래서 던진다.
 *
 * 확인 메일은 **가입 요청 안에서 곁다리로** 나간다. 실패를 던지면 메일이 반송됐다는
 * 이유로 **가입 자체가 실패한다** — 확인은 필수가 아니므로 계정은 만들어지는 것이 맞다.
 * 시드가 만드는 계정은 전부 `.test` 주소(RFC 6761)라 실제로 반송된다.
 *
 * 이 비대칭을 적어 두지 않으면 "일관성" 이라며 한쪽을 다른 쪽에 맞추게 된다. 어느 쪽으로
 * 맞춰도 하나는 고장이다.
 */
describe('메일 발송의 실패를 다루는 법', () => {
  it('비밀번호 재설정 — 받는 사람과 주소를 담아 보낸다', async () => {
    await options.emailAndPassword.sendResetPassword({ user, url: 'https://plain.test/reset?t=1' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'a@plain.test' });
  });

  it('비밀번호 재설정 — 발송이 실패하면 던진다 (오지 않는 메일을 기다리게 두지 않는다)', async () => {
    send.mockRejectedValue(new Error('발송 사업자가 거절했다'));

    await expect(
      options.emailAndPassword.sendResetPassword({ user, url: 'https://plain.test/reset?t=1' }),
    ).rejects.toThrow('발송 사업자가 거절했다');
  });

  it('가입 확인 — 보낸다', async () => {
    await options.emailVerification.sendVerificationEmail({ user, url: 'https://plain.test/verify?t=1' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'a@plain.test' });
  });

  it('가입 확인 — 발송이 실패해도 삼킨다 (메일 때문에 가입이 실패하면 안 된다)', async () => {
    send.mockRejectedValue(new Error('.test 주소는 반송된다'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      options.emailVerification.sendVerificationEmail({ user, url: 'https://plain.test/verify?t=1' }),
    ).resolves.toBeUndefined();
    // 삼키되 흔적은 남긴다 — 아무 데도 안 적으면 메일이 안 가는 것을 알 길이 없다
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  /**
   * **받는 사람의 말로 보낸다.** 계정에 적힌 말이 있으면 그것, 없으면 지금 요청의
   * `accept-language`. 가입 훅과 메일 보내는 자리가 앞뒤로 붙어 있어 아직 저장이 안 된
   * 채로 도달할 수 있다(`localeForUser` 의 주석).
   */
  it.each([
    ['계정에 적힌 말', 'ja', undefined, 'ja'],
    ['요청의 말', null, 'ja,en;q=0.9', 'ja'],
    ['둘 다 없으면 기본 말', null, undefined, 'ko'],
  ] as const)('%s 을 따른다', async (_label, stored, acceptLanguage, expected) => {
    db.user.findUnique.mockResolvedValue(stored === null ? null : { locale: stored });
    const request = acceptLanguage === undefined
      ? undefined
      : new Request('http://localhost/', { headers: { 'accept-language': acceptLanguage } });

    await options.emailAndPassword.sendResetPassword({ user, url: 'https://plain.test/r' }, request);

    // 사전을 거쳐 나온 글자로 견준다 — 말이 섞이면 제목부터 달라진다
    expect(send.mock.calls[0]![0].subject).toBe(createTranslator(expected)('mail.reset.subject'));
    expect(createTranslator('ko')('mail.reset.subject'))
      .not.toBe(createTranslator('ja')('mail.reset.subject'));
  });

  /**
   * **말을 못 읽어도 메일은 나간다.**
   *
   * 계정의 말을 묻는 조회가 흔들렸을 때 그대로 던지면, **재설정 메일 자체가 실패한다** —
   * 비밀번호를 잊은 사람이 들어올 길이 사라진다. 어느 말로 보낼지는 그보다 작은 문제라
   * 기본 말로 내려앉는다.
   */
  it('계정의 말을 묻는 조회가 실패해도 기본 말로 보낸다', async () => {
    db.user.findUnique.mockRejectedValue(new Error('DB 가 흔들렸다'));

    await options.emailAndPassword.sendResetPassword({ user, url: 'https://plain.test/r' });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0].subject).toBe(createTranslator('ko')('mail.reset.subject'));
  });
});

/**
 * **세션을 만들기 전에 정지를 본다.**
 *
 * 판정은 `suspension.ts` 가 하고 검사도 거기 있다. 여기서 보는 것은 **훅이 그 판정을
 * 부르는지**다 — 이 한 줄을 지워도 저쪽 검사는 전부 초록이고, 정지된 계정은 로그인할
 * 때마다 새 세션을 받는다. 정지를 걸어 둔 운영자는 걸렸다고 믿는다.
 */
describe('세션을 만들기 전', () => {
  it('그 사람이 정지됐는지 묻는다', async () => {
    await options.databaseHooks.session.create.before({ userId: 'u-9' });

    expect(suspension.assertNotSuspended).toHaveBeenCalledWith('u-9');
  });

  it('정지면 세션이 만들어지지 않는다 — 판정이 던지는 대로 올린다', async () => {
    suspension.assertNotSuspended.mockRejectedValue(new Error('이용이 정지된 계정입니다'));

    await expect(options.databaseHooks.session.create.before({ userId: 'u-9' }))
      .rejects.toThrow('이용이 정지된 계정입니다');
  });
});

/**
 * **계정을 고치기 전에 값을 본다.**
 *
 * 같은 결이다 — 판정은 `profile.ts` 가 하고, 여기서는 훅이 그것을 부르는지만 본다.
 * 지우면 이름이 아무리 길어도, 연락처가 글자여도 그대로 저장된다.
 */
describe('계정을 고치기 전', () => {
  it('고치려는 값을 판정에 넘긴다', async () => {
    await options.databaseHooks.user.update.before({ name: '김손님', phone: '010-0000-0000' });

    expect(profile.assertProfileUpdate).toHaveBeenCalledWith({ name: '김손님', phone: '010-0000-0000' });
  });

  /**
   * **이 훅은 `async` 가 아니라 동기로 던진다.**
   *
   * `assertProfileUpdate` 가 동기 함수라(`APIError` 를 그 자리에서 던진다) 훅도
   * `before(data) { assertProfileUpdate(data); return Promise.resolve(); }` 모양이다.
   * 그래서 막히는 값은 **부르는 줄에서** 터진다 — 돌려받은 약속이 거절되는 것이 아니다.
   *
   * 둘은 부르는 쪽에 다르게 보인다: `hook(x).catch(...)` 만 쓰는 호출자는 동기 throw 를
   * 못 잡는다. 지금 모양을 못 박아 두면, 누가 `async` 를 붙여 거절로 바꿀 때 **조용히
   * 바뀌지 않고** 이 검사가 먼저 말한다.
   */
  it('판정이 막으면 저장되지 않는다 — 부르는 줄에서 던진다', () => {
    profile.assertProfileUpdate.mockImplementation(() => { throw new Error('이름이 너무 깁니다'); });

    expect(() => options.databaseHooks.user.update.before({ name: 'x'.repeat(200) }))
      .toThrow('이름이 너무 깁니다');
  });
});

/**
 * **가입 직후 — 둘을 적는다. 둘 다 실패해도 가입은 남는다.**
 *
 * `after` 훅이라 계정은 이미 만들어져 있다. 여기서 던지면 **가입이 되돌아가는 것이 아니라
 * 창구가 실패를 돌려준다** — 사람은 가입이 안 된 줄 알고 다시 누르고, 그 주소는 이미
 * 쓰이고 있다. 포인트를 못 받는 것보다 그쪽이 훨씬 나쁘다.
 */
describe('가입 직후', () => {
  const ctx = { headers: new Headers({ 'accept-language': 'ja,en;q=0.9' }) };

  it('가입 화면을 보던 말과 필수 동의 시각을 적는다', async () => {
    await options.databaseHooks.user.create.after(user, ctx);

    const [[call]] = db.user.update.mock.calls as [[{ where: unknown; data: { locale: string; termsAgreedAt: Date } }]];
    expect(call.where).toEqual({ id: 'u-1' });
    expect(call.data.locale).toBe('ja');
    expect(call.data.termsAgreedAt).toBeInstanceOf(Date);
  });

  it('요청이 없으면 기본 말로 적는다 — 네이티브 셸처럼 헤더가 없는 길이 있다', async () => {
    await options.databaseHooks.user.create.after(user, undefined);

    expect(db.user.update.mock.calls[0]![0].data.locale).toBe('ko');
  });

  /**
   * **원장과 잔액을 한 트랜잭션으로 준다.**
   *
   * 잔액만 올리면 `PointTransaction` 합계와 처음부터 어긋나고 **그 뒤로는 아무도
   * 알아채지 못한다.** 둘을 따로 보내면 사이에서 끊겼을 때 같은 일이 생긴다.
   */
  it('포인트는 원장과 잔액을 한 트랜잭션으로 준다', async () => {
    await options.databaseHooks.user.create.after(user, ctx);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.$transaction.mock.calls[0]![0]).toHaveLength(2);
    expect(db.pointTransaction.create).toHaveBeenCalledTimes(1);
  });

  it('원장에 가입 축하로 적고 만료일을 함께 둔다', async () => {
    const before = new Date();
    await options.databaseHooks.user.create.after(user, ctx);

    const { data } = db.pointTransaction.create.mock.calls[0]![0] as {
      data: { userId: string; amount: number; reason: string; expiresAt: Date };
    };
    expect(data).toMatchObject({ userId: 'u-1', amount: SIGNUP_POINTS, reason: 'EARN_SIGNUP' });
    // 적립 포인트의 수명은 core 가 정한다 — 여기서 따로 세지 않는다
    expect(data.expiresAt.getTime()).toBeGreaterThanOrEqual(rewardExpiresAt(before).getTime());
  });

  it('잔액은 덮어쓰지 않고 더한다 — 같은 순간의 다른 적립을 지우지 않으려고', async () => {
    await options.databaseHooks.user.create.after(user, ctx);

    const calls = db.user.update.mock.calls.map((c) => c[0] as { data: Record<string, unknown> });
    expect(calls.some((c) => c.data['pointBalance'] !== undefined
      && JSON.stringify(c.data['pointBalance']) === JSON.stringify({ increment: SIGNUP_POINTS }))).toBe(true);
  });

  it.each([
    ['말·동의 적기가', () => db.user.update.mockRejectedValue(new Error('DB 가 흔들렸다'))],
    ['포인트 지급이', () => db.$transaction.mockRejectedValue(new Error('DB 가 흔들렸다'))],
  ])('%s 실패해도 가입은 남는다', async (_label, breakIt) => {
    breakIt();
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(options.databaseHooks.user.create.after(user, ctx)).resolves.toBeUndefined();

    logged.mockRestore();
  });

  /** 말을 못 적었다고 포인트까지 건너뛰면 안 된다 — 둘은 서로 독립이다 */
  it('말·동의 적기가 실패해도 포인트는 준다', async () => {
    db.user.update.mockRejectedValueOnce(new Error('DB 가 흔들렸다'));

    await options.databaseHooks.user.create.after(user, ctx);

    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});
