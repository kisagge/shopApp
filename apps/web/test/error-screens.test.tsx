// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ErrorScreen from '~/app/error';
import AdminError from '~/app/admin/error';

/**
 * 화면이 깨졌을 때의 두 경계 — **아무도 그려 본 적이 없었다.**
 *
 * 메타 그물(error-boundary-coverage)은 구역마다 경계가 **있는지**만 본다. 그릴 때 무슨 일이
 * 일어나는지는 어디서도 안 봤다. 그런데 이 경계들의 요점은 생김새가 아니라 **그려지는 순간
 * 하는 일**이다.
 *
 * **브라우저에서 난 오류는 우리가 보내지 않으면 아무도 모른다.** 서버 오류는 instrumentation 이
 * 받고, 그 밖의 브라우저 오류는 ErrorReporter 가 window 의 error 로 듣는다. 그런데 React 가
 * 잡은 오류는 거기까지 올라오지 않는다 — 이 경계가 보내는 것이 **유일한 길**이다. 그 한 줄이
 * 사라지면 화면이 깨져도 원장이 조용하다.
 *
 * 운영 쪽은 실제로 빠져 있었다(콘솔에만 적었다). 같이 채웠다.
 *
 * 원인을 화면에 적지 않는 것도 여기서 지킨다 — 오류 메시지에는 내부 구조가 드러나는 일이 흔하다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{}', { status: 202 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

/** 원장으로 간 몸. 보고는 keepalive 로 쏘고 기다리지 않으므로 호출을 기다린다. */
const reported = async () => {
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0]!;
  expect(url).toBe('/api/errors');
  return JSON.parse(init.body) as { name: string; message: string; stack: string | null; routePath: string };
};

type Boom = Error & { digest?: string };

/** 오류 번호가 붙은 것과 안 붙은 것. **지우는 것이 아니라 처음부터 없이** 만든다(exactOptionalPropertyTypes) */
const boom = (): Boom => Object.assign(new Error('내부 어딘가의 널 참조'), { digest: 'd-1234' });
const noDigest = (): Boom => new Error('내부 어딘가의 널 참조');

describe('손님 화면이 깨졌을 때', () => {
  it('깨진 것을 원장으로 보낸다 — 이 경계가 유일한 길이다', async () => {
    render(<ErrorScreen error={boom()} reset={() => {}} />);

    const body = await reported();
    expect(body).toMatchObject({ name: 'Error', message: '내부 어딘가의 널 참조' });
    expect(body.stack).not.toBeNull();
  });

  it('오류 번호는 보여 주고 원인은 적지 않는다', () => {
    render(<ErrorScreen error={boom()} reset={() => {}} />);

    expect(screen.getByText('오류 번호 d-1234')).toBeTruthy();
    expect(screen.queryByText(/널 참조/)).toBeNull();
  });

  it('번호가 없으면 그 자리를 비워 둔다 — "오류 번호 undefined" 를 보여 주지 않는다', () => {
    render(<ErrorScreen error={noDigest()} reset={() => {}} />);

    expect(screen.queryByText(/오류 번호/)).toBeNull();
  });

  it('다시 시도를 누르면 다시 그리라고 말한다', async () => {
    const reset = vi.fn();
    render(<ErrorScreen error={boom()} reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('운영 화면이 깨졌을 때', () => {
  it('깨진 것을 원장으로 보낸다 — 운영진이 말해 줄 때까지 기다리지 않는다', async () => {
    render(<AdminError error={boom()} reset={() => {}} />);

    const body = await reported();
    expect(body).toMatchObject({ message: '내부 어딘가의 널 참조' });
  });

  it('다른 메뉴는 쓸 수 있다고 알려 준다 — 화면이 그렇게 보여도 말해 주지 않으면 모른다', () => {
    render(<AdminError error={boom()} reset={() => {}} />);

    expect(screen.getByText(/다른 메뉴는 그대로 쓸 수 있습니다/)).toBeTruthy();
    expect(screen.getByText('오류 번호 d-1234')).toBeTruthy();
    expect(screen.queryByText(/널 참조/)).toBeNull();
  });

  it('다시 시도를 누르면 다시 그리라고 말한다', async () => {
    const reset = vi.fn();
    render(<AdminError error={boom()} reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
