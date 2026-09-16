import { describe, it, expect, vi } from 'vitest';
import { clampToLastPage } from '~/lib/queries/paged';

/**
 * 범위를 넘은 쪽을 마지막 쪽으로 당긴다.
 *
 * **쪽 번호는 당기는데 목록은 안 당겼다.** 화면의 쪽 번호(core 의 pageNav)는 범위를
 * 벗어난 값을 가장 가까운 쪽으로 당겨 그리는데, 줄을 읽는 쪽은 받은 숫자를 그대로
 * skip 에 넣었다. `?page=999` 가 **마지막 쪽이 칠해진 채 목록만 빈** 화면이 됐다.
 */

const row = (n: number) => ({ id: `r-${n}` });

describe('당기기', () => {
  it('줄이 있으면 그대로 둔다', async () => {
    const readAt = vi.fn<(p: number) => Promise<{ id: string }[]>>();

    const rows = await clampToLastPage([row(1)], { page: 2, pageSize: 25, total: 90 }, readAt);

    expect(rows).toEqual([row(1)]);
    expect(readAt, '멀쩡한 쪽은 다시 읽지 않는다').not.toHaveBeenCalled();
  });

  it('범위를 넘었으면 마지막 쪽을 읽는다', async () => {
    const readAt = vi.fn(async () => [row(9)]);

    const rows = await clampToLastPage([], { page: 999, pageSize: 25, total: 90 }, readAt);

    // 90건 / 25 = 4쪽
    expect(readAt).toHaveBeenCalledWith(4);
    expect(rows).toEqual([row(9)]);
  });

  it('진짜로 빈 목록은 다시 읽지 않는다 — 없는 것을 더 찾아봐야 없다', async () => {
    const readAt = vi.fn<(p: number) => Promise<{ id: string }[]>>();

    const rows = await clampToLastPage([], { page: 5, pageSize: 25, total: 0 }, readAt);

    expect(rows).toEqual([]);
    expect(readAt).not.toHaveBeenCalled();
  });

  it('마지막 쪽이 마침 비었으면 다시 읽지 않는다 — 그 사이 줄이 지워진 것이다', async () => {
    /*
     * 세는 것과 읽는 것 사이에 줄이 지워지면 범위 안의 쪽도 빌 수 있다.
     * 그때 같은 쪽을 다시 읽어 봐야 같은 답이고, 왕복만 하나 는다.
     */
    const readAt = vi.fn<(p: number) => Promise<{ id: string }[]>>();

    const rows = await clampToLastPage([], { page: 4, pageSize: 25, total: 90 }, readAt);

    expect(rows).toEqual([]);
    expect(readAt).not.toHaveBeenCalled();
  });

  it('한 쪽짜리 목록에서도 첫 쪽으로 당긴다', async () => {
    const readAt = vi.fn(async () => [row(1)]);

    await clampToLastPage([], { page: 7, pageSize: 25, total: 3 }, readAt);

    expect(readAt).toHaveBeenCalledWith(1);
  });
});
