// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }) }));

const { ReturnAddressForm } = await import('~/components/admin/return-address-form');

/** 반품지 폼 — 틀린 칸을 먼저 말하고, 보낸 뒤 결과를 알림 영역에 적는다 */

const fetchMock = vi.fn<(...a: any[]) => any>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
});

const fill = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/받는 분/), '스튜디오눈 반품담당');
  await user.type(screen.getByLabelText(/반품 담당자 휴대폰/), '010-0000-0101');
  await user.type(screen.getByLabelText(/우편번호/), '04799');
  await user.type(screen.getByLabelText(/^주소/), '서울 성동구 성수이로 00');
};

describe('반품지 폼', () => {
  it('등록된 반품지를 칸에 채워 연다 — 고치러 오는 화면이다', () => {
    render(
      <ReturnAddressForm
        owner="m-a"
        initial={{ recipient: '반품담당', phone: '010-0000-0101', postalCode: '04799', address1: '서울 성동구 성수이로 00', address2: '1층' }}
      />,
    );
    expect(screen.getByLabelText(/받는 분/)).toHaveValue('반품담당');
    expect(screen.getByLabelText(/상세주소/)).toHaveValue('1층');
    expect(screen.getByRole('button', { name: '반품지 수정' })).toBeInTheDocument();
  });

  it('등록된 것이 없으면 단추가 등록이라고 말한다', () => {
    render(<ReturnAddressForm owner="platform" initial={null} />);
    expect(screen.getByRole('button', { name: '반품지 등록' })).toBeInTheDocument();
  });

  it('빈 칸·틀린 형식이면 보내지 않고 첫 칸으로 초점을 옮긴다', async () => {
    const user = userEvent.setup();
    render(<ReturnAddressForm owner="m-a" initial={null} />);
    await user.click(screen.getByRole('button', { name: '반품지 등록' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/받는 분/)).toHaveFocus();
    expect(screen.getByLabelText(/우편번호/)).toHaveAccessibleDescription(/우편번호 5자리/);
  });

  it('휴대폰 형식이 아니면 그 칸을 짚는다 — 택배 기사가 거는 번호다', async () => {
    const user = userEvent.setup();
    render(<ReturnAddressForm owner="m-a" initial={null} />);
    await user.type(screen.getByLabelText(/받는 분/), '반품담당');
    await user.type(screen.getByLabelText(/반품 담당자 휴대폰/), '02-1234-5678');
    await user.type(screen.getByLabelText(/우편번호/), '04799');
    await user.type(screen.getByLabelText(/^주소/), '서울 성동구 성수이로 00');
    await user.click(screen.getByRole('button', { name: '반품지 등록' }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/반품 담당자 휴대폰/)).toHaveFocus();
  });

  it('저장하면 그 반품지 주소로 PUT 하고 결과를 알림 영역에 적는다', async () => {
    const user = userEvent.setup();
    render(<ReturnAddressForm owner="m-a" initial={null} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '반품지 등록' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/admin/return-addresses/m-a');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toMatchObject({ recipient: '스튜디오눈 반품담당', postalCode: '04799' });
    expect(await screen.findByRole('status')).toHaveTextContent('반품지를 저장했습니다');
    expect(refresh).toHaveBeenCalled();
  });

  it('서버가 칸을 짚어 거절하면 그 칸에 적고 초점을 옮긴다', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ message: '주소를 확인해 주세요.', fields: { address1: '주소를 입력해 주세요' } }),
    });
    render(<ReturnAddressForm owner="m-a" initial={null} />);
    await fill(user);
    await user.click(screen.getByRole('button', { name: '반품지 등록' }));

    // 칸 오류와 저장 실패가 둘 다 알림이다 — 둘 다 읽혀야 한다
    const alerts = await screen.findAllByRole('alert');
    expect(alerts.map((a) => a.textContent)).toEqual(
      expect.arrayContaining(['주소를 입력해 주세요', '주소를 확인해 주세요.']),
    );
    expect(screen.getByLabelText(/^주소/)).toHaveFocus();
  });
});
