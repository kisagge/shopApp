// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { MerchantSettingsForm } = await import('~/components/admin/merchant-settings-form');

/** 연락처와 정산 계좌 — 돈이 나가는 자리다 */

const initial = {
  contactEmail: 'contact@studionoon.test',
  contactPhone: '010-1111-2222',
  settlementBank: null,
  settlementAccount: null,
  settlementHolder: null,
};

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({}));
});

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.selectOptions(screen.getByLabelText(/^은행/), 'KB');
  await user.type(screen.getByLabelText(/^계좌번호/), '123-4567-8901');
  await user.type(screen.getByLabelText(/^예금주/), '스튜디오눈 주식회사');
};

describe('정산 계좌', () => {
  it('은행은 고르게 한다 — 자유 입력이면 같은 은행이 여러 이름으로 섞인다', () => {
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);

    const bank = screen.getByLabelText(/^은행/);
    expect(bank.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'KB국민은행' })).toBeInTheDocument();
  });

  it('적어 둔 값을 채워 두고 연다', () => {
    render(
      <MerchantSettingsForm
        merchantId="m-a"
        businessName="스튜디오눈 주식회사"
        initial={{ ...initial, settlementBank: 'SHINHAN', settlementAccount: '110123456789', settlementHolder: '스튜디오눈 주식회사' }}
      />,
    );
    expect(screen.getByLabelText(/^은행/)).toHaveValue('SHINHAN');
    expect(screen.getByLabelText(/^계좌번호/)).toHaveValue('110123456789');
  });

  it('고른 값을 그대로 보낸다', async () => {
    const user = userEvent.setup();
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '정보 저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/merchants/m-a/settings');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toMatchObject({ settlementBank: 'KB', settlementHolder: '스튜디오눈 주식회사' });
  });

  it('은행을 안 고르면 보내지 않고 그 칸으로 초점을 옮긴다', async () => {
    const user = userEvent.setup();
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    await user.click(screen.getByRole('button', { name: '정보 저장' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('은행을 골라 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^은행/)).toHaveFocus();
  });

  it('예금주가 사업자명과 다르면 막지 않고 말만 한다', async () => {
    /*
     * 개인사업자가 대표 이름으로 받는 일은 흔하다. 막으면 멀쩡한 계좌를 못 넣는다 —
     * 다만 오타일 때가 더 많으므로 눈에 띄게 적어 둔다.
     */
    const user = userEvent.setup();
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    await user.selectOptions(screen.getByLabelText(/^은행/), 'KB');
    await user.type(screen.getByLabelText(/^계좌번호/), '12345678901');
    await user.type(screen.getByLabelText(/^예금주/), '김대표');

    expect(screen.getByText(/사업자명\(스튜디오눈 주식회사\)과 다릅니다/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '정보 저장' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });

  it('창구가 거절하면 그 이유를 그대로 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ message: '권한이 없습니다' }, { status: 403 }));
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '정보 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다');
  });
});

/**
 * **연락처가 비어 있으면 보내지 않는다.**
 *
 * 이 둘은 **우리가 가맹점에게 닿는 유일한 길**이다 — 입점 심사 결과, 반품 요청, 정산 안내가
 * 그 주소로 간다. 비어 있거나 모양이 아니면 보내는 쪽에서 먼저 막고 그 칸으로 초점을 옮긴다.
 */
describe('연락처 칸', () => {
  const open = () => {
    const user = userEvent.setup();
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    return user;
  };

  it('이메일에 @ 가 없으면 보내지 않고 그 칸에 적는다', async () => {
    const user = open();
    // 붙박이 값이 이미 채워져 있다 — 비우고 적어야 내가 넣은 값이 된다
    await user.clear(screen.getByLabelText(/^연락 이메일/));
    await user.type(screen.getByLabelText(/^연락 이메일/), 'studio.noon.test');
    await fill(user);

    await user.click(screen.getByRole('button', { name: '정보 저장' }));

    expect(screen.getByText('연락 받을 이메일을 입력해 주세요.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('연락처가 비어 있으면 보내지 않고 그 칸에 적는다', async () => {
    const user = open();
    await user.clear(screen.getByLabelText(/^연락처/));
    await fill(user);

    await user.click(screen.getByRole('button', { name: '정보 저장' }));

    expect(screen.getByText('연락처를 입력해 주세요.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

/**
 * **저장하지 못했을 때.** 정산 계좌가 걸린 폼이라, 바뀐 줄 알고 넘어가면 **돈이 옛 계좌로
 * 간다.** 서버가 어느 칸인지 알려 주면 그 칸에 잇고 **초점까지 옮긴다** — 긴 폼이라 어디가
 * 문제인지 눈으로 찾게 두면 그 사이에 다른 칸을 고친다.
 */
describe('정보를 저장하지 못하면', () => {
  const save = async () => {
    const user = userEvent.setup();
    render(<MerchantSettingsForm merchantId="m-a" businessName="스튜디오눈 주식회사" initial={initial} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '정보 저장' }));
  };

  it('서버가 짚은 칸에 잇고 그 칸으로 초점을 옮긴다', async () => {
    fetchMock.mockResolvedValue(Response.json(
      { fields: { settlementAccount: '계좌번호를 확인해 주세요.' } }, { status: 400 }));

    await save();

    await waitFor(() => expect(screen.getByText('계좌번호를 확인해 주세요.')).toBeInTheDocument());
    expect(screen.getByLabelText(/^계좌번호/)).toHaveFocus();
  });

  it('요청이 못 가면 네트워크 오류라고 말한다', async () => {
    fetchMock.mockRejectedValue(new Error('네트워크가 끊겼다'));

    await save();

    expect((await screen.findByRole('alert')).textContent).toContain('네트워크 오류로 저장하지 못했습니다');
  });

  /**
   * **본문이 JSON 이 아닌 거절.**
   *
   * 앞단이 502 HTML 을 주거나 본문이 비면 `response.json()` 이 던진다. 그 던짐을 잡지
   * 않으면 바깥 `catch` 로 떨어져 **"네트워크 오류" 가 뜬다** — 요청은 갔고 서버가 거절한
   * 것인데 사람은 연결 문제로 읽는다. 받침이 그 자리를 막는다(`failure-message` 가 적어 둔
   * 그 고장이다).
   */
  it('본문이 JSON 이 아닌 거절도 네트워크 오류로 말하지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await save();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('저장하지 못했습니다');
    expect(alert.textContent).not.toContain('네트워크 오류');
  });
});
