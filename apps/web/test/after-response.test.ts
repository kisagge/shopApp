import { describe, it, expect, vi, beforeEach } from 'vitest';

const after = vi.hoisted(() => vi.fn<(work: () => Promise<void>) => void>());
vi.mock('next/server', () => ({ after }));

const { afterResponse } = await import('~/lib/api/after-response');

/**
 * 응답 뒤로 미루는 자리.
 *
 * **이 검사가 없으면 미룬 것을 아무도 못 본다.** 단위 검사는 요청 없이
 * 함수를 부르므로 `afterResponse` 가 그 자리에서 돌려 준다 — 그래서 다른
 * 검사들은 미루기 전과 똑같이 통과한다. 그건 좋은 성질이지만, 그 성질 때문에
 * **정말 미뤄지는지는 여기서만 확인된다.**
 */
describe('응답 뒤로 미루기', () => {
  beforeEach(() => vi.clearAllMocks());

  it('요청 안에서는 일을 넘기기만 하고 기다리지 않는다', async () => {
    let ran = false;
    const returned = afterResponse(async () => { ran = true; });

    // 넘겼으니 아직 돌지 않았다 — 응답이 이것을 기다리지 않는다는 뜻이다
    expect(after).toHaveBeenCalledOnce();
    expect(ran).toBe(false);
    expect(returned).toBeUndefined();

    // 넘긴 그 일이 진짜 우리 일이어야 한다
    await after.mock.calls[0]![0]();
    expect(ran).toBe(true);
  });

  it('요청 밖에서는 그 자리에서 돌리고 약속을 돌려준다', async () => {
    // Next 는 요청 범위 밖에서 부르면 던진다 — 조용히 버리지 않는다
    after.mockImplementationOnce(() => { throw new Error('`after` was called outside a request scope'); });

    let ran = false;
    const returned = afterResponse(async () => { ran = true; });
    expect(returned).toBeInstanceOf(Promise);
    await returned;
    expect(ran).toBe(true);
  });
});
