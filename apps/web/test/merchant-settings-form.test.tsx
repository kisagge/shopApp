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
