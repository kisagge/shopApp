// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { MerchantCommissionForm } = await import('~/components/admin/merchant-commission-form');

/** 수수료율 — 바꾼 값은 아직 확정하지 않은 기간부터 쓰인다 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(Response.json({ commissionPercent: 12 }));
});

const form = () => (
  <MerchantCommissionForm merchantId="m-a" initial={15} appliesFrom="2026-09" />
);

describe('수수료율 폼', () => {
  it('언제부터 적용되는지 먼저 말한다 — 확정한 정산은 그대로다', () => {
    render(form());
    expect(screen.getByText(/2026-09 정산부터 적용됩니다/)).toBeInTheDocument();
    expect(screen.getByText(/이미 확정한 정산은 그때 요율로 남습니다/)).toBeInTheDocument();
  });

  it('지금 요율을 채워 두고 연다', () => {
    render(form());
    expect(screen.getByLabelText(/^수수료율/)).toHaveValue(15);
  });

  it('사유 없이는 보내지 않는다 — 숫자만 바뀐 기록은 왜 그렇게 됐는지 답하지 못한다', async () => {
    const user = userEvent.setup();
    render(form());
    await user.click(screen.getByRole('button', { name: '수수료율 저장' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await screen.findByText('바꾸는 사유를 적어 주세요.')).toBeInTheDocument();
    expect(screen.getByLabelText(/^바꾸는 사유/)).toHaveFocus();
  });

  it('절반을 넘는 값은 보내기 전에 막는다', async () => {
    const user = userEvent.setup();
    render(form());
    await user.clear(screen.getByLabelText(/^수수료율/));
    await user.type(screen.getByLabelText(/^수수료율/), '80');
    await user.type(screen.getByLabelText(/^바꾸는 사유/), '재계약');
    await user.click(screen.getByRole('button', { name: '수수료율 저장' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^수수료율/)).toHaveFocus();
  });

  it('요율과 사유를 함께 보내고, 언제부터인지 말한다', async () => {
    const user = userEvent.setup();
    render(form());
    await user.clear(screen.getByLabelText(/^수수료율/));
    await user.type(screen.getByLabelText(/^수수료율/), '12');
    await user.type(screen.getByLabelText(/^바꾸는 사유/), '2026년 재계약');
    await user.click(screen.getByRole('button', { name: '수수료율 저장' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/merchants/m-a/commission');
    expect(JSON.parse(init.body)).toEqual({ commissionPercent: 12, reason: '2026년 재계약' });

    await waitFor(() =>
      expect(screen.getByRole('status')).toHaveTextContent('12% 로 바꿨습니다. 2026-09 정산부터'),
    );
  });

  it('창구가 거절하면 그 이유를 그대로 말한다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(Response.json({ message: '권한이 없습니다' }, { status: 403 }));
    render(form());
    await user.type(screen.getByLabelText(/^바꾸는 사유/), '재계약');
    await user.click(screen.getByRole('button', { name: '수수료율 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('권한이 없습니다');
  });
});
