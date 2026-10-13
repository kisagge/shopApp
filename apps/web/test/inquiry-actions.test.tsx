// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ANSWER_MAX_LENGTH } from '@shop/core';
import { InquiryActions } from '~/components/inquiry-actions';

/**
 * 문의 한 건에 붙는 동작 — 답하기와 지우기.
 *
 * 검사가 한 줄도 없었다. 그리고 **답을 올린 뒤 폼이 그대로 열려 있었다.** 새로고침으로
 * 답변이 위에 나타나는데 그 아래 쓰던 칸이 같은 글을 쥔 채 남으니, 올라간 건지 알 수
 * 없어 한 번 더 누르게 된다. 서버는 이미 답한 문의라 409 를 준다 — **방금 성공한
 * 사람에게 "이미 답변한 문의입니다" 를 보여 주는 셈**이다.
 *
 * 폼 갈래는 `canAnswer` 를 보지 않으므로 답할 수 없게 되어도 저 혼자 열려 있다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const ok = () => vi.fn(async () => new Response(JSON.stringify({ answered: true }), { status: 200 }));
const fails = (message: string, status = 409) =>
  vi.fn(async () => new Response(JSON.stringify({ message }), { status }));

const open = (over: Partial<Parameters<typeof InquiryActions>[0]> = {}) =>
  render(<InquiryActions inquiryId="q-1" canDelete canAnswer {...over} />);

const openAnswerForm = async () => {
  await userEvent.click(screen.getByRole('button', { name: '답변하기' }));
  return screen.getByRole('textbox');
};

const write = async (text: string) => {
  await userEvent.type(await openAnswerForm(), text);
};

const post = () => userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', ok());
});

/**
 * **할 수 있는 사람에게만 보인다.** 못 하는 단추를 띄워 두면 눌러 보고 나서야 안 된다는
 * 것을 알게 되고, 그 사이에 자기가 할 수 있는 일이라고 믿는다.
 */
describe('누구에게 무엇이 보이나', () => {
  it('답할 수 있으면 답하기가 있다', () => {
    open({ canAnswer: true, canDelete: false });

    expect(screen.getByRole('button', { name: '답변하기' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '내 문의 삭제' })).toBeNull();
  });

  it('지울 수 있으면 삭제가 있다', () => {
    open({ canAnswer: false, canDelete: true });

    expect(screen.getByRole('button', { name: '내 문의 삭제' })).toBeDefined();
    expect(screen.queryByRole('button', { name: '답변하기' })).toBeNull();
  });

  it('둘 다 아니면 아무 단추도 두지 않는다', () => {
    open({ canAnswer: false, canDelete: false });

    expect(screen.queryAllByRole('button')).toEqual([]);
  });
});

describe('답하기', () => {
  it('적은 답을 그 문의로 보낸다', async () => {
    open();

    await write('내일 발송됩니다');
    await post();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/inquiries/q-1/answer');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ answer: '내일 발송됩니다' });
  });

  it('앞뒤 공백은 떼고 보낸다', async () => {
    open();

    await write('  내일 발송됩니다  ');
    await post();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ answer: '내일 발송됩니다' });
  });

  /** 빈 답을 보내면 서버가 거절한다. 거기까지 가기 전에 막는다. */
  it.each([
    ['아무것도 안 적었으면', ''],
    ['공백만 적었으면', '   '],
  ])('%s 올릴 수 없다', async (_why, text) => {
    open();

    const box = await openAnswerForm();
    if (text) await userEvent.type(box, text);

    expect(screen.getByRole('button', { name: '답변 등록' })).toBeDisabled();
  });

  it('한 글자라도 적으면 올릴 수 있다', async () => {
    open();

    await write('네');

    expect(screen.getByRole('button', { name: '답변 등록' })).toBeEnabled();
  });

  /** 상한은 core 가 정한다 — 화면에 숫자를 적어 두면 서버와 갈린다 */
  it('답변 길이 상한은 core 의 값을 쓴다', async () => {
    open();

    expect((await openAnswerForm()).getAttribute('maxlength')).toBe(String(ANSWER_MAX_LENGTH));
  });

  it('쓰는 칸에 이름이 붙어 있다', async () => {
    open();

    expect(await openAnswerForm()).toHaveAccessibleName('답변');
  });

  /*
   * 여기가 고장이 있던 자리다. 폼이 열린 채 같은 글을 쥐고 있으면 한 번 더 누르게 되고,
   * 그 두 번째가 409 를 받아 방금 성공한 사람에게 실패를 보여 준다.
   */
  it('올리고 나면 쓰던 칸을 닫는다', async () => {
    open();

    await write('내일 발송됩니다');
    await post();

    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  });

  it('다시 열어도 지난 글이 남아 있지 않다', async () => {
    open();

    await write('내일 발송됩니다');
    await post();
    await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());

    expect(await openAnswerForm()).toHaveValue('');
  });

  it('올렸으면 화면을 다시 받아 온다 — 답변이 위에 나타나야 한다', async () => {
    open();

    await write('내일 발송됩니다');
    await post();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('보내는 동안 단추가 이름을 바꾸고 다시 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await write('내일 발송됩니다');
    await post();

    expect(screen.getByRole('button', { name: '등록 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('취소하면 아무것도 보내지 않고 닫는다', async () => {
    open();

    await write('내일 발송됩니다');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('답을 못 올렸을 때', () => {
  it('서버가 말한 까닭을 전한다', async () => {
    vi.stubGlobal('fetch', fails('이미 답변한 문의입니다.'));
    open();

    await write('내일 발송됩니다');
    await post();

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 답변한 문의입니다.');
  });

  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })));
    open();

    await write('내일 발송됩니다');
    await post();

    expect(await screen.findByRole('alert')).toHaveTextContent('처리하지 못했습니다.');
  });

  it('길이 끊기면 네트워크 오류라고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await write('내일 발송됩니다');
    await post();

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });

  /** 못 올렸으면 쓴 글을 지우지 않는다 — 다시 치게 하면 안 된다 */
  it('못 올렸으면 쓰던 글을 그대로 둔다', async () => {
    vi.stubGlobal('fetch', fails('이미 답변한 문의입니다.'));
    open();

    await write('내일 발송됩니다');
    await post();

    await screen.findByRole('alert');
    expect(screen.getByRole('textbox')).toHaveValue('내일 발송됩니다');
  });

  it('못 올렸으면 화면을 다시 받아 오지 않는다', async () => {
    vi.stubGlobal('fetch', fails('이미 답변한 문의입니다.'));
    open();

    await write('내일 발송됩니다');
    await post();

    await screen.findByRole('alert');
    expect(refresh).not.toHaveBeenCalled();
  });
});

/**
 * **지우기는 한 번 더 묻는다.** 문의는 되살릴 수 없고, 글자 작은 링크라 스치듯 눌린다.
 */
describe('지우기', () => {
  const askToDelete = () => userEvent.click(screen.getByRole('button', { name: '내 문의 삭제' }));

  it('바로 지우지 않고 묻는다', async () => {
    open();

    await askToDelete();

    expect(screen.getByText('삭제할까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('묻는 자리에서 한 번 더 눌러야 지운다', async () => {
    open();

    await askToDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/inquiries/q-1', { method: 'DELETE' }));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await askToDelete();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '내 문의 삭제' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('못 지웠으면 까닭을 말하고 묻는 자리에 그대로 둔다', async () => {
    vi.stubGlobal('fetch', fails('이미 답변한 문의는 지울 수 없습니다.', 403));
    open();

    await askToDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 답변한 문의는 지울 수 없습니다.');
    expect(screen.getByRole('button', { name: '삭제' })).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('지우는 동안 다시 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await askToDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(screen.getByRole('button', { name: '삭제 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
