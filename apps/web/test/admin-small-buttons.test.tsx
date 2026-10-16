// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ResolveButton } from '~/app/admin/errors/resolve-button';
import { ReconcileButton } from '~/app/admin/points/reconcile-button';
import { MarkReadButton } from '~/app/admin/notifications/mark-read-button';
import { MarkNotificationsRead } from '~/components/mark-notifications-read';

/**
 * 운영 화면의 **작은 단추들** — 누르면 보내고 결과를 말하는 것이 전부인 조각들.
 *
 * 넷 다 검사가 한 줄도 없었다. 작아서 눈에 안 띄는 자리이고, 그래서 **한 번 어긋나면 오래
 * 간다.** 읽어 보니 대부분 잘 짜여 있었고 하나가 틀려 있었다.
 *
 * **오류 처리 단추는 실패하면 자기가 사라졌다.** 까닭을 적는 것까지는 맞는데 단추 **대신**
 * 적었다 — 망이 한 번 끊기면 그 줄의 단추가 통째로 없어져 다시 눌러 볼 수도, 그 말을 치울
 * 수도 없다. 화면을 새로 받기 전까지.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const fails = (message?: string, status = 500) =>
  vi.fn(async () => new Response(JSON.stringify(message ? { message } : {}), { status }));
const offline = () => vi.fn(async () => { throw new Error('offline'); });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', ok());
});

/**
 * 오류 하나를 처리했다고 표시하거나 되돌린다. **지우는 단추가 아니다** — 기록은 남고,
 * 그 뒤에 또 나면 스스로 다시 열린다.
 */
describe('오류 처리 표시', () => {
  const open = (resolved = false) =>
    render(<ResolveButton fingerprint="abc/def" resolved={resolved} />);

  it('아직 안 본 오류에는 처리함이라고 적는다', () => {
    open(false);

    expect(screen.getByRole('button', { name: '처리함' })).toBeDefined();
  });

  it('처리한 오류에는 되돌릴 말을 적는다', () => {
    open(true);

    expect(screen.getByRole('button', { name: '다시 열기' })).toBeDefined();
  });

  it('지금과 반대되는 값을 보낸다', async () => {
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '처리함' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    // 지문에 슬래시가 들어 있다 — 주소로 쓰려면 인코딩해야 한다
    expect(url).toBe('/api/admin/errors/abc%2Fdef');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ resolved: true });
  });

  it('되면 화면을 다시 받아 온다', async () => {
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '처리함' }));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /* 여기가 고장이 있던 자리다 */
  it('실패해도 단추는 그 자리에 남는다', async () => {
    vi.stubGlobal('fetch', fails('이미 처리된 오류입니다.'));
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '처리함' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 처리된 오류입니다.');
    expect(screen.getByRole('button', { name: '처리함' })).toBeDefined();
  });

  it('다시 눌러 되면 지난 까닭이 사라진다', async () => {
    vi.stubGlobal('fetch', offline());
    open(false);
    await userEvent.click(screen.getByRole('button', { name: '처리함' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');

    vi.stubGlobal('fetch', ok());
    await userEvent.click(screen.getByRole('button', { name: '처리함' }));

    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', fails());
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '처리함' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('바꾸지 못했습니다.');
  });
});

/** 대사 — 원장 합계로 잔액을 덮어쓴다. 어긋난 것이 없으면 돌릴 까닭도 없다. */
describe('포인트 대사', () => {
  it('어긋난 것이 없으면 누를 수 없다', () => {
    render(<ReconcileButton mismatchCount={0} />);

    expect(screen.getByRole('button', { name: '원장에 맞추기' })).toBeDisabled();
  });

  it('어긋난 것이 있으면 누를 수 있다', () => {
    render(<ReconcileButton mismatchCount={3} />);

    expect(screen.getByRole('button', { name: '원장에 맞추기' })).toBeEnabled();
  });

  it('몇 건을 맞췄는지 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ fixed: 7 }), { status: 200 })));
    render(<ReconcileButton mismatchCount={7} />);

    await userEvent.click(screen.getByRole('button', { name: '원장에 맞추기' }));

    expect(await screen.findByRole('status')).toHaveTextContent('7건의 잔액을 원장에 맞췄습니다');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /** 실패는 공손한 알림으로 두면 낭독기가 뒤로 미루거나 지나친다 */
  it('실패는 경고로 알린다', async () => {
    vi.stubGlobal('fetch', fails('대사 중 다른 작업이 돌고 있습니다.', 409));
    render(<ReconcileButton mismatchCount={3} />);

    await userEvent.click(screen.getByRole('button', { name: '원장에 맞추기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('대사 중 다른 작업이 돌고 있습니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('보내는 동안 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    render(<ReconcileButton mismatchCount={3} />);

    await userEvent.click(screen.getByRole('button', { name: '원장에 맞추기' }));

    expect(screen.getByRole('button', { name: '대사 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

/**
 * **운영 알림함은 할 일 목록이라 열었다고 끝난 것이 아니다.** 사람이 닫는다.
 */
describe('알림 읽음 처리', () => {
  it('닫을 줄이 없으면 아무것도 그리지 않는다', () => {
    const { container } = render(<MarkReadButton ids={[]} label="읽음 처리" />);

    expect(container).toBeEmptyDOMElement();
  });

  /** 줄마다 "읽음" 이 선 목록에서 낭독기는 어느 줄의 것인지 알 수 없다 */
  it('무엇을 닫는지 이름에 담는다', () => {
    render(<MarkReadButton ids={['n-1']} label="코트 재고가 3개 남았습니다 읽음 처리" />);

    expect(screen.getByRole('button', { name: '코트 재고가 3개 남았습니다 읽음 처리' })).toBeDefined();
  });

  it('고른 줄만 운영 알림함으로 보낸다', async () => {
    render(<MarkReadButton ids={['n-1', 'n-2']} label="읽음 처리" />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/notifications/read?box=console');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ ids: ['n-1', 'n-2'] });
  });

  /** 목록을 다시 받아야 점과 뱃지가 함께 바뀐다 — 한쪽만 바뀌면 숫자가 거짓이 된다 */
  it('되면 화면을 다시 받아 온다', async () => {
    render(<MarkReadButton ids={['n-1']} label="읽음 처리" />);

    await userEvent.click(screen.getByRole('button'));

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /*
   * 조용히 아무 일도 안 일어나면 사람은 한 번 더 누르고, 그래도 안 되면 이 단추가 원래
   * 그런 줄 안다.
   */
  it('실패하면 그 자리에 말하고 단추는 남는다', async () => {
    vi.stubGlobal('fetch', fails());
    render(<MarkReadButton ids={['n-1']} label="읽음 처리" />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('alert')).toHaveTextContent('처리하지 못했습니다');
    expect(screen.getByRole('button', { name: '읽음 처리' })).toBeDefined();
  });

  it('길이 끊겨도 말한다', async () => {
    vi.stubGlobal('fetch', offline());
    render(<MarkReadButton ids={['n-1']} label="읽음 처리" />);

    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  it('모두 읽음 자리는 다른 말을 쓴다', () => {
    render(<MarkReadButton ids={['n-1']} label="모두 읽음 처리" variant="all" />);

    expect(screen.getByRole('button', { name: '모두 읽음 처리' })).toHaveTextContent('모두 읽음');
  });
});

/**
 * **GET 이 값을 바꾸지 않게** 따로 둔다. 화면을 그리면서 표시해 버리면 브라우저가 링크를
 * 미리 받아 두는 것만으로 뱃지가 사라진다.
 */
describe('열어 본 것을 읽음으로', () => {
  it('연 알림함을 서버에 알린다', async () => {
    render(<MarkNotificationsRead box="console" />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/notifications/read?box=console',
      expect.objectContaining({ method: 'POST' }),
    ));
  });

  /** 다른 알림함의 것까지 읽음으로 만들면 안 된다 */
  it('적지 않으면 손님 알림함이다', async () => {
    render(<MarkNotificationsRead />);

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/notifications/read?box=customer',
      expect.anything(),
    ));
  });

  it('아무것도 그리지 않는다', () => {
    const { container } = render(<MarkNotificationsRead />);

    expect(container).toBeEmptyDOMElement();
  });

  /** 못 눌러도 다음 방문에 다시 시도된다 — 화면을 막을 이유가 없다 */
  it('실패해도 화면을 막지 않는다', async () => {
    vi.stubGlobal('fetch', offline());

    expect(() => render(<MarkNotificationsRead />)).not.toThrow();
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });
});
