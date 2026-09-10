// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 앱이 뜰 때 세션을 되살리는 쪽.
 *
 * **필요할 때만 부른다.** 서버가 이미 알아봤으면 부를 이유가 없고, 브라우저
 * 에서는 쿠키가 하는 일이라 아예 하지 않는다. 토큰이 없으면 부를 것도 없다.
 */

const native = vi.hoisted((): { shell: boolean; token: string | null } => ({ shell: true, token: 't.sig' }));

vi.mock('@shop/native', () => ({
  isNativeShell: () => native.shell,
  hydrateSessionToken: async () => native.token,
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { NativeSession } = await import('~/components/native-session');

const fetchMock = vi.hoisted(() => vi.fn());
beforeEach(() => {
  native.shell = true;
  native.token = 't.sig';
  refresh.mockClear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
});

const calls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes('/api/native/session'));

describe('앱의 세션 되살리기', () => {
  it('쿠키가 없으면 토큰으로 되돌려 달라고 한다', async () => {
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(calls()).toHaveLength(1));

    const [, init] = calls()[0]!;
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer t.sig');
  });

  it('되살아나면 화면을 서버에서 다시 받는다 — 서버가 그린 부분이 바뀌어야 한다', async () => {
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('서버가 이미 알아봤으면 부르지 않는다', async () => {
    render(<NativeSession signedIn />);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls()).toHaveLength(0);
  });

  it('토큰이 없으면 부를 것도 없다', async () => {
    native.token = null;
    render(<NativeSession signedIn={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls()).toHaveLength(0);
  });

  it('브라우저에서는 아무 일도 하지 않는다 — 쿠키가 이미 하고 있다', async () => {
    native.shell = false;
    render(<NativeSession signedIn={false} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(calls()).toHaveLength(0);
  });

  it('토큰이 낡아 거절당하면 화면을 다시 받지 않는다 — 로그인 화면이 맞다', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(calls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(refresh).not.toHaveBeenCalled();
  });
});
