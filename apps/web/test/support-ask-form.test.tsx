// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from './render';
import userEvent from '@testing-library/user-event';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const { SupportAskForm } = await import('~/components/support-ask-form');

/**
 * 고객센터 1:1 문의 폼.
 *
 * **이 조각에는 검사가 하나도 없었다** — 커버리지로 물어서 찾았다. 그리고 그 안에 결함이 있었다.
 *
 * ## 실패했는데 단추 이름이 떴다
 *
 * 보내기가 거절되거나 터지면 경고 자리에 **`support.submit`**, 곧 '문의 보내기' 가 떴다
 * (영어로는 'Send', 일본어로는 '送信'). 글을 다 쓴 사람이 **단추 이름을 다시 읽는** 셈이고,
 * 실패한 것을 알 길이 없었다 — 다시 누르면 되는지, 글을 어디에 옮겨 둬야 하는지도.
 *
 * 같은 결의 다른 자리들은 무엇이 안 됐는지 말한다(`ret.failed`·`cancel.failed`). 그래서
 * `support.askFailed` 를 세 사전에 넣고 두 자리를 그것으로 바꿨다.
 *
 * ## 글은 남는다
 *
 * 실패했을 때 쓴 글을 지우면 **사람이 다시 쓴다.** 성공했을 때만 비운다 — 그 차이를 함께 본다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(json(201, { id: 'q-1' }));
});

const content = () => screen.getByLabelText('문의 내용');
const send = () => screen.getByRole('button', { name: '문의 보내기' });

async function write(text = '배송이 3일째 멈춰 있습니다.') {
  render(<SupportAskForm />);
  await userEvent.type(content(), text);
}

describe('보내기', () => {
  it('고른 갈래와 쓴 글을 보낸다', async () => {
    await write();
    await userEvent.selectOptions(screen.getByLabelText('무엇에 대한 문의인가요?'), '결제');

    await userEvent.click(send());

    const sent = JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string) as Record<string, unknown>;
    expect(sent).toMatchObject({ topic: 'PAYMENT', content: '배송이 3일째 멈춰 있습니다.' });
    expect(refresh).toHaveBeenCalled();
  });

  it('끝나면 접수했다고 말하고 글을 비운다', async () => {
    await write();
    await userEvent.click(send());

    expect(await screen.findByText(/문의를 접수했습니다/)).toBeInTheDocument();
    expect(content()).toHaveValue('');
  });

  /**
   * **기본은 비공개다.** 배송·결제·계정 문의는 주문번호나 사는 곳을 적게 되고, 그것이
   * 남에게 보일 이유가 없다(상품 문의는 반대로 공개가 기본이다).
   */
  it('기본은 비공개이고, 끄면 공개로 보낸다', async () => {
    await write();
    const box = screen.getByRole('checkbox', { name: /비공개로 문의하기/ });
    expect(box).toBeChecked();

    await userEvent.click(box);
    await userEvent.click(send());

    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1].body as string)).toMatchObject({ isPrivate: false });
  });
});

/**
 * **실패는 실패로 보여야 한다.**
 *
 * 서버가 한 말이 있으면 그것을 쓰고, 없으면 **무엇이 안 됐는지** 말한다. 예전에는 둘 다
 * '문의 보내기' 였다 — 단추 이름이다.
 */
describe('보내지 못했을 때', () => {
  it('서버가 한 말을 그대로 보여 준다', async () => {
    fetchMock.mockResolvedValue(json(429, { message: '잠시 뒤에 다시 보내 주세요.' }));
    await write();

    await userEvent.click(send());

    expect((await screen.findByRole('alert')).textContent).toContain('잠시 뒤에 다시 보내 주세요.');
  });

  it.each([
    ['서버가 아무 말도 안 하면', async () => fetchMock.mockResolvedValue(json(500, {}))],
    ['요청 자체가 터지면', async () => fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다'))],
    ['본문이 JSON 이 아니면', async () => fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }))],
  ])('%s 무엇이 안 됐는지 말한다 — 단추 이름이 아니라', async (_label, arrange) => {
    await arrange();
    await write();

    await userEvent.click(send());

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('문의를 보내지 못했습니다');
    // 단추 이름이 오류 자리에 오지 않는다 — 그것이 이 결함의 모양이었다
    expect(alert.textContent).not.toBe('문의 보내기');
  });

  /** 쓴 글을 지우면 사람이 다시 쓴다 — 성공했을 때만 비운다 */
  it('쓴 글을 지우지 않는다', async () => {
    fetchMock.mockResolvedValue(json(500, {}));
    await write('배송이 3일째 멈춰 있습니다.');

    await userEvent.click(send());
    await screen.findByRole('alert');

    expect(content()).toHaveValue('배송이 3일째 멈춰 있습니다.');
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('다시 누를 수 있다 — 보내는 중에서 멈추지 않는다', async () => {
    fetchMock.mockResolvedValueOnce(json(500, {}));
    await write();

    await userEvent.click(send());
    await screen.findByRole('alert');

    await userEvent.click(send());
    expect(await screen.findByText(/문의를 접수했습니다/)).toBeInTheDocument();
  });
});

/**
 * **사진은 한 장이 5MB 까지다.**
 *
 * 넘는 것을 그대로 보내면 창구가 거절하는데, 그때는 글까지 함께 되돌아온다 — 미리 막고
 * **고른 파일을 비운다.** 안 비우면 같은 파일이 입력에 남아 다시 누를 때 또 걸린다.
 */
describe('사진', () => {
  const file = (name: string, bytes: number) =>
    new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });

  it('5MB 를 넘으면 말하고 받지 않는다', async () => {
    render(<SupportAskForm photosEnabled />);

    await userEvent.upload(screen.getByLabelText('사진 (선택)'), file('big.jpg', 5 * 1024 * 1024 + 1));

    expect((await screen.findByRole('alert')).textContent).toContain('5MB');
    expect(screen.queryByRole('list', { name: /사진/ })).toBeNull();
  });

  it('5MB 까지는 받는다 — 거절이 한 칸 넓지 않은지', async () => {
    render(<SupportAskForm photosEnabled />);

    await userEvent.upload(screen.getByLabelText('사진 (선택)'), file('ok.jpg', 1024));

    expect(screen.queryByRole('alert')).toBeNull();
  });
});
