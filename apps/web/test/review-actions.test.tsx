// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ReviewActions } from '~/components/review-actions';
import { MarketingConsentToggle } from '~/components/marketing-consent-toggle';
import { InquiryAnswerForm } from '~/components/admin/inquiry-answer-form';

/**
 * 손님·운영 양쪽의 **남은 작은 조각들.**
 *
 * 셋 다 검사가 한 줄도 없었다. 리뷰 동작에 둘이 있었고, 둘 다 이미 다른 자리에서 고친
 * 모양이었다.
 *
 * **지우기가 실패하면 단추가 모두 사라졌다.** 까닭을 적는 것까지는 맞는데 단추 **대신**
 * 적어서, 한 번 실패하면 고치기까지 함께 없어진다 — 다시 눌러 볼 수도 그 말을 치울 수도
 * 없다. 운영 화면의 오류 처리 단추가 같은 모양이었다.
 *
 * **서버가 한 말을 무방비로 읽었다.** 앞단이 502 HTML 을 주면 그 줄이 던지고, 서버가 답했는데
 * "네트워크 오류" 가 대신 뜬다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/link', () => ({
  default: ({ children, ...rest }: { children: React.ReactNode }) => <a {...rest}>{children}</a>,
  useLinkStatus: () => ({ pending: false }),
}));

const ok = () => vi.fn(async () => new Response('{}', { status: 200 }));
const fails = (message?: string, status = 409) =>
  vi.fn(async () => new Response(JSON.stringify(message ? { message } : {}), { status }));
const offline = () => vi.fn(async () => { throw new Error('offline'); });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', ok());
});

/**
 * **지우기는 흔적을 남기지 않는다** — 주문 항목당 하나라는 제약 때문에, 남기면 같은 구매로
 * 다시 쓸 수 없다. 그래서 한 번 더 묻는다.
 */
describe('내 리뷰 동작', () => {
  const open = (showEdit = true) => render(<ReviewActions reviewId="r-1" showEdit={showEdit} />);
  const askDelete = () => userEvent.click(screen.getByRole('button', { name: '내 리뷰 삭제' }));

  it('고치는 자리로 가는 길이 있다', () => {
    open();

    expect(screen.getByRole('link', { name: '수정' }))
      .toHaveAttribute('href', '/mypage/reviews/r-1/edit');
  });

  /** 고치는 화면 자체에서는 자기 자신으로 가는 길을 그리지 않는다 */
  it('고치는 화면에서는 그 길을 감춘다', () => {
    open(false);

    expect(screen.queryByRole('link', { name: '수정' })).toBeNull();
  });

  it('첫 누름으로는 지우지 않는다', async () => {
    open();

    await askDelete();

    expect(screen.getByText('삭제할까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 물음 옆에 다른 길을 늘어놓으면 무엇을 누르는지 흐려진다 */
  it('묻는 동안에는 고치기를 감춘다', async () => {
    open();

    await askDelete();

    expect(screen.queryByRole('link', { name: '수정' })).toBeNull();
  });

  it('한 번 더 눌러야 지운다', async () => {
    open();

    await askDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/reviews/r-1',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await askDelete();
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '내 리뷰 삭제' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /* 여기가 고장이 있던 자리다 — 실패하면 단추가 전부 사라졌다 */
  it('실패해도 단추는 그 자리에 남는다', async () => {
    vi.stubGlobal('fetch', fails('이미 지워진 리뷰입니다.'));
    open();

    await askDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 지워진 리뷰입니다.');
    expect(screen.getByRole('button', { name: '삭제' })).toBeDefined();
    expect(screen.getByRole('button', { name: '취소' })).toBeDefined();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await askDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('삭제하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', offline());
    open();

    await askDelete();
    await userEvent.click(screen.getByRole('button', { name: '삭제' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});

/**
 * **철회할 길이 없으면 동의가 아니다.** 가입 화면에서 받은 선택 동의를 되돌릴 자리다.
 * 이 값은 계정의 것이라 서버에 저장한다 — 기기를 바꿔도 따라와야 한다.
 */
describe('혜택 소식 받기', () => {
  const open = (initial: boolean) => render(<MarketingConsentToggle initial={initial} />);

  it('지금 상태를 색이 아니라 글로 말한다', () => {
    open(true);

    expect(screen.getByText('받는 중')).toBeDefined();
    expect(screen.getByRole('button', { name: '그만 받기' })).toBeDefined();
  });

  it('꺼져 있으면 켜는 말을 한다', () => {
    open(false);

    expect(screen.getByText('받지 않음')).toBeDefined();
    expect(screen.getByRole('button', { name: '받기' })).toBeDefined();
  });

  it('반대되는 값을 보낸다', async () => {
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '받기' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/account/consent');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ marketing: true });
  });

  it('되면 상태가 바뀐다', async () => {
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '받기' }));

    expect(await screen.findByText('받는 중')).toBeDefined();
  });

  /** 안 바뀐 것을 바뀐 것처럼 보여 주면 다음에 메일이 안 와도 까닭을 모른다 */
  it('못 바꿨으면 상태를 그대로 두고 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', fails(undefined, 500));
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '받기' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('설정을 바꾸지 못했습니다');
    expect(screen.getByText('받지 않음')).toBeDefined();
  });

  it('길이 끊겨도 말한다', async () => {
    vi.stubGlobal('fetch', offline());
    open(false);

    await userEvent.click(screen.getByRole('button', { name: '받기' }));

    expect(await screen.findByRole('alert')).toBeDefined();
  });

  /** 주문·배송 안내는 이 설정과 상관없이 나간다 — 끄는 사람이 그것까지 끊길까 걱정하지 않게 */
  it('무엇이 이 설정과 무관한지 적어 둔다', () => {
    open(true);

    expect(screen.getByText(/주문·배송 안내는 이 설정과 상관없이 나갑니다/)).toBeDefined();
  });
});

/**
 * 대기줄에서 바로 답한다. **대기줄은 처리하는 자리이지 찾아보는 자리가 아니다** — 상품
 * 화면으로 옮겨 다니게 하면 한 건마다 두 번 이동한다.
 */
describe('문의 대기줄에서 답하기', () => {
  const open = () => render(<InquiryAnswerForm inquiryId="q-1" productName="레더 코트" />);

  /** 어느 문의의 칸인지 이름에 담는다 — 대기줄에는 여러 건이 한 화면에 선다 */
  it('어느 상품의 문의인지 이름에 담는다', () => {
    open();

    expect(screen.getByLabelText('레더 코트 문의 답변')).toBeDefined();
  });

  it('비어 있으면 올릴 수 없다', () => {
    open();

    expect(screen.getByRole('button', { name: '답변 등록' })).toBeDisabled();
  });

  it('공백만 적어도 올릴 수 없다', async () => {
    open();

    await userEvent.type(screen.getByRole('textbox'), '   ');

    expect(screen.getByRole('button', { name: '답변 등록' })).toBeDisabled();
  });

  it('적은 답을 다듬어 그 문의로 보낸다', async () => {
    open();

    await userEvent.type(screen.getByRole('textbox'), '  내일 발송됩니다  ');
    await userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/inquiries/q-1/answer');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ answer: '내일 발송됩니다' });
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('못 올렸으면 까닭을 말하고 적은 글을 그대로 둔다', async () => {
    vi.stubGlobal('fetch', fails('이미 답변한 문의입니다.'));
    open();

    await userEvent.type(screen.getByRole('textbox'), '내일 발송됩니다');
    await userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 답변한 문의입니다.');
    expect(screen.getByRole('textbox')).toHaveValue('내일 발송됩니다');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', offline());
    open();

    await userEvent.type(screen.getByRole('textbox'), '내일 발송됩니다');
    await userEvent.click(screen.getByRole('button', { name: '답변 등록' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
