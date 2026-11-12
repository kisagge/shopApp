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

describe('던져진 값에서 읽을 말을 뽑는 표', () => {
  /*
   * **Error 가 아닌 것도 던져진다.** 라이브러리가 문자열을 던지고, 거절이
   * 숫자로 오고, 객체가 그대로 올라온다. `String()` 하나로 넘기면 "[object
   * Object]" 나 함수 본문 전체가 메시지로 저장된다 — 저장된 뒤에는 무엇이
   * 터졌는지 알 길이 없다.
   *
   * 갈래마다 다른 길을 타므로 표로 세운다. 객체와 빈 값은 위에서 이미 본다.
   */
  it.each([
    ['문자열', '장바구니를 못 읽었습니다', '장바구니를 못 읽었습니다'],
    ['숫자', 500, '500'],
    ['참거짓', false, 'false'],
    ['아주 큰 수', 9_007_199_254_740_993n, '9007199254740993'],
  ])('%s 가 던져지면 그 값을 적는다', (_what, thrown, expected) => {
    reportClientError(thrown, '기본 문구');

    expect(sent()[0].message).toBe(expected);
  });

  it('함수가 던져지면 이름만 적는다 — 본문 전체가 메시지가 되면 안 된다', () => {
    function parseCart(): void {}
    reportClientError(parseCart, '기본 문구');

    expect(sent()[0].message).toBe('parseCart()');
  });

  it('이름 없는 함수는 그렇다고 적는다', () => {
    reportClientError(() => {}, '기본 문구');

    // 익명 함수에 이름이 붙는 경우가 있어(변수명 추론) 꼴만 본다
    expect(sent()[0].message).toMatch(/^[^(]*\(\)$/);
  });

  it('심볼도 읽을 수 있게 적는다', () => {
    reportClientError(Symbol('장바구니'), '기본 문구');

    expect(sent()[0].message).toBe('Symbol(장바구니)');
  });

  it('돌고 도는 객체는 JSON 으로 못 적으니 꼴만 적는다 — 여기서 또 던지면 보고가 보고를 깬다', () => {
    const circular: Record<string, unknown> = { at: 'cart' };
    circular['self'] = circular;

    expect(() => reportClientError(circular, '기본 문구')).not.toThrow();
    expect(sent()[0].message).toBe('[object Object]');
  });

  it('이름은 Error 일 때만 그 이름을 쓴다 — 아니면 Error 로 적는다', () => {
    class CartError extends Error {
      override name = 'CartError';
    }
    reportClientError(new CartError('장바구니'), '기본');
    reportClientError('그냥 글자', '기본');

    expect(sent().map((b: { name: string }) => b.name)).toEqual(['CartError', 'Error']);
  });

  it('스택은 Error 에만 있다 — 없으면 null 로 보낸다', () => {
    reportClientError('그냥 글자', '기본');

    expect(sent()[0].stack).toBeNull();
  });

  it('어느 화면에서 났는지 함께 보낸다 — 누가 겪었는지는 담지 않는다', () => {
    reportClientError(new Error('터졌다'), '기본');

    const body = sent()[0] as Record<string, unknown>;
    expect(body.routePath).toBe(window.location.pathname);
    expect(Object.keys(body).sort()).toEqual(['message', 'name', 'routePath', 'stack']);
  });

  it('따로 부르는 쪽은 저마다 자기 묶음을 쓴다 — 한 번 보낸 뒤에도 다음 자리는 보낼 수 있다', () => {
    /*
     * 창에서 올라오는 오류는 한 묶음을 공유해 같은 것을 한 번만 보내지만,
     * 화면 경계(error.tsx)처럼 따로 부르는 자리는 그 묶음을 안 받는다.
     */
    reportClientError(new Error('같은 오류'), '기본');
    reportClientError(new Error('같은 오류'), '기본');

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('묶음을 건네면 같은 오류를 한 번만 보낸다', () => {
    const seen = new Set<string>();
    reportClientError(new Error('같은 오류'), '기본', seen);
    reportClientError(new Error('같은 오류'), '기본', seen);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
