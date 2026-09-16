// @vitest-environment jsdom
import { render } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { ErrorReporter, reportClientError } = await import('~/components/error-reporter');

/**
 * 브라우저 오류 보고.
 *
 * **그 전까지 브라우저 오류는 아무도 몰랐다.** 앱(웹뷰)에서는 개발자 도구도 배포 로그도 없다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
});

const sent = () => fetchMock.mock.calls.map(([, init]) => JSON.parse((init as { body: string }).body));

describe('창에서 올라오는 오류', () => {
  it('처리되지 않은 오류를 보낸다', () => {
    render(<ErrorReporter />);
    window.dispatchEvent(
      new ErrorEvent('error', { error: new TypeError('undefined 를 읽었다'), message: 'x' }),
    );

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/errors');
    expect(sent()[0]).toMatchObject({ name: 'TypeError', message: 'undefined 를 읽었다' });
  });

  it('같은 오류를 두 번 보내지 않는다', () => {
    /*
     * 렌더 하나가 깨지면 리렌더마다 같은 것이 또 난다. 그대로 두면 한 화면에서 수십 번 나간다 —
     * 서버도 지문별로 묶지만 그건 받고 난 뒤의 이야기다.
     */
    render(<ErrorReporter />);
    const fire = () =>
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError('같은 오류'), message: 'x' }));
    fire();
    fire();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('붙잡히지 않은 거절도 듣는다', () => {
    render(<ErrorReporter />);
    const event = new Event('unhandledrejection') as Event & { reason?: unknown };
    event.reason = new Error('약속이 깨졌다');
    window.dispatchEvent(event);

    expect(sent()[0]).toMatchObject({ message: '약속이 깨졌다' });
  });

  it('떠나는 중에도 가도록 keepalive 로 보낸다', () => {
    render(<ErrorReporter />);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('가는 길'), message: 'x' }));

    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ keepalive: true });
  });

  it('떼어 내면 더 듣지 않는다', () => {
    const { unmount } = render(<ErrorReporter />);
    unmount();

    /*
     * 듣는 사람이 없는 error 이벤트는 그대로 "잡히지 않은 오류" 가 된다(jsdom 도 그렇게 본다).
     * 여기서 보려는 것은 우리 조각이 떼어졌다는 것뿐이라, 삼키는 사람을 잠깐 세워 둔다.
     */
    const swallow = (event: Event) => event.preventDefault();
    window.addEventListener('error', swallow);
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('이제는'), message: 'x' }));
    window.removeEventListener('error', swallow);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Error 가 아닌 것이 던져져도', () => {
  it('객체는 JSON 으로 적는다 — "[object Object]" 는 아무것도 말해 주지 않는다', () => {
    reportClientError({ code: 'BOOM', at: 'cart' }, '기본 문구');
    expect(sent()[0].message).toBe('{"code":"BOOM","at":"cart"}');
  });

  it('빈 값이면 기본 문구를 쓴다', () => {
    reportClientError(null, '화면을 그리다 오류가 났습니다');
    expect(sent()[0].message).toBe('화면을 그리다 오류가 났습니다');
  });

  it('보내기가 실패해도 조용하다 — 오류 보고가 화면을 또 깨면 안 된다', () => {
    fetchMock.mockRejectedValue(new Error('network'));
    expect(() => reportClientError(new Error('원래 오류'), '기본')).not.toThrow();
  });
});
