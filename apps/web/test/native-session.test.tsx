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
const clearToken = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock('@shop/native', () => ({
  isNativeShell: () => native.shell,
  hydrateSessionToken: async () => native.token,
  clearSessionToken: clearToken,
}));
const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { NativeSession } = await import('~/components/native-session');

const fetchMock = vi.hoisted(() => vi.fn());
beforeEach(() => {
  native.shell = true;
  native.token = 't.sig';
  refresh.mockClear();
  clearToken.mockClear();
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

  it('거절당한 토큰은 기기에서 지운다', async () => {
    /*
     * **지우지 않으면 죽은 자격증명을 들고 다닌다.** 401 은 그 토큰으로 아무것도 안
     * 된다는 뜻인데, 남겨 두면 앱을 켤 때마다 여기서 한 번 거절당하고 창구를 부를
     * 때마다 Bearer 로 따라간다 — 다음 로그인이 덮어쓸 때까지.
     */
    fetchMock.mockResolvedValue({ ok: false, status: 401 });
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(clearToken).toHaveBeenCalledTimes(1));
  });

  it('되살아났으면 지우지 않는다', async () => {
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(clearToken).not.toHaveBeenCalled();
  });

  it('망이 끊긴 것은 거절이 아니다 — 지하철에서 켠 사람을 로그아웃시키지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(calls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(clearToken).not.toHaveBeenCalled();
  });

  it('서버가 다른 까닭으로 거절해도 지우지 않는다 — 토큰 탓이 아니다', async () => {
    // 요청이 잦아 막힌 것(429)은 토큰이 낡은 것과 다르다
    fetchMock.mockResolvedValue({ ok: false, status: 429 });
    render(<NativeSession signedIn={false} />);
    await waitFor(() => expect(calls()).toHaveLength(1));
    await new Promise((r) => setTimeout(r, 30));
    expect(clearToken).not.toHaveBeenCalled();
  });
});
