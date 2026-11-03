// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProductReport } from '~/components/product-report';

/**
 * 상품 신고 조각.
 *
 * **누른 뒤에 무슨 일이 일어났는지 보이고 들려야 한다.** 단추가 사라지는 자리라, 초점과
 * 알림을 챙기지 않으면 키보드·낭독기 사용자는 신고가 됐는지 알 길이 없다 — 리뷰 신고가
 * 같은 결함을 한 번 겪고 그렇게 고쳤다.
 */

const fetchMock = vi.fn<(...a: any[]) => any>();

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(Response.json({ reported: true }));
  vi.stubGlobal('fetch', fetchMock);
});

const open = async () => {
  const user = userEvent.setup();
  render(<ProductReport productId="p-1" productName="울 코트" />);
  await user.click(screen.getByRole('button', { name: '이 상품 신고' }));
  return user;
};

describe('펼침 판', () => {
  it('여는 단추가 펼침 상태와 가리키는 판을 말한다', () => {
    render(<ProductReport productId="p-1" productName="울 코트" />);

    const trigger = screen.getByRole('button', { name: '이 상품 신고' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger.getAttribute('aria-controls')).toBeTruthy();
  });

  it('열면 판으로 초점이 간다 — 단추가 사라지므로 갈 곳을 정해 줘야 한다', async () => {
    await open();

    expect(screen.getByRole('form', { name: '울 코트 신고' })).toHaveFocus();
  });

  it('닫으면 눌렀던 단추로 초점이 돌아온다', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '이 상품 신고' })).toHaveFocus();
  });
});

describe('사유', () => {
  it('상품을 가리키는 말만 고르게 한다 — 글을 신고하는 말은 없다', async () => {
    await open();

    expect(screen.getByRole('radio', { name: '정품이 아닌 것 같아요' })).toBeDefined();
    expect(screen.getByRole('radio', { name: '팔 수 없는 물건이에요' })).toBeDefined();
    expect(screen.queryByRole('radio', { name: '광고 · 도배' })).toBeNull();
  });

  /** 아무것도 안 고른 채 보내지는 것을 막는다 — 분류가 안 되면 대기줄이 읽을거리가 된다 */
  it('하나는 미리 골라 둔다', async () => {
    await open();

    expect(screen.getByRole('radio', { name: '정품이 아닌 것 같아요' })).toBeChecked();
  });
});

describe('보내기', () => {
  it('고른 사유와 적은 내용을 함께 보낸다', async () => {
    const user = await open();

    await user.click(screen.getByRole('radio', { name: '안전에 문제가 있어요' }));
    await user.type(screen.getByLabelText('자세한 내용 (선택)'), '  손잡이가 부러졌어요 ');
    await user.click(screen.getByRole('button', { name: '신고' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/products/p-1/report');
    expect(JSON.parse(init.body)).toEqual({ reason: 'UNSAFE', detail: '손잡이가 부러졌어요' });
  });

  it('빈 내용은 null 로 보낸다 — 빈 글자와 "안 적었다" 는 다른 말이다', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: '신고' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).detail).toBeNull();
  });

  /** 결과가 폼을 대신한다. 초점이 거기로 가야 낭독기가 그 말을 읽는다. */
  it('받았다는 말로 바뀌고 초점이 그리로 간다', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: '신고' }));

    const result = await screen.findByRole('status');
    expect(result.textContent).toContain('신고를 받았습니다');
    expect(result).toHaveFocus();
  });

  it('보내는 중에는 다시 눌려도 한 번만 나간다', async () => {
    const user = await open();
    let release: (value: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => { release = resolve; }));

    const send = screen.getByRole('button', { name: '신고' });
    await user.click(send);
    await user.click(send);
    release(Response.json({ reported: true }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

describe('실패할 때', () => {
  it('서버가 한 말을 그대로 읽힌다', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ message: '이미 신고한 상품입니다.' }, { status: 409 }),
    );
    const user = await open();

    await user.click(screen.getByRole('button', { name: '신고' }));

    expect((await screen.findByRole('alert')).textContent).toContain('이미 신고한 상품입니다.');
  });

  /** 502 가 HTML 을 주면 본문을 읽는 줄이 던진다 — 서버가 한 말 대신 기본 문구를 쓴다 */
  it('JSON 이 아닌 실패에도 멈추지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 502 }));
    const user = await open();

    await user.click(screen.getByRole('button', { name: '신고' }));

    expect((await screen.findByRole('alert')).textContent).toContain('신고하지 못했습니다');
  });

  it('창구가 끊기면 네트워크 오류로 말하고 폼은 남는다', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const user = await open();

    await user.click(screen.getByRole('button', { name: '신고' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(screen.getByRole('button', { name: '신고' })).toBeDefined();
  });
});
