// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { ShippingPolicyForm } from '~/app/admin/shipping/shipping-form';

/**
 * 배송비 정책 — **손님이 내는 돈을 정하는 자리.**
 *
 * 검사가 한 줄도 없었다. 계약을 먼저 읽고 들어갔더니 둘이 나왔다.
 *
 * **하나, 계약이 막는 규칙을 화면이 말하지 않았다.** 무료 기준은 기본료보다 커야 한다
 * (`updateShippingPolicySchema`). 까닭도 거기 적혀 있다 — "3,000원짜리 배송비에 무료 기준이
 * 2,000원이면 사실상 언제나 무료인데, 화면에는 '2,000원 이상 무료배송' 이라고 적힌다."
 * 그런데 눌러 본 뒤에야 알려 줬다.
 *
 * **둘, 칸 아래 적어 둔 말이 틀렸다.** "0 은 '언제나 무료' 라는 뜻입니다" 라고 했는데, 계약은
 * 0 을 **언제나** 거절한다(기본료가 0 이어도 `0 > 0` 이 거짓이다). 적어 둔 말이 할 수 없는
 * 일을 가리키고 있었다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const open = (over: Partial<Parameters<typeof ShippingPolicyForm>[0]> = {}) =>
  render(
    <ShippingPolicyForm
      {...{ baseFee: 3000, freeThreshold: 50000, remoteSurcharge: 3000, ...over }}
    />,
  );

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));
const save = () => screen.getByRole('button', { name: '저장' });

const retype = async (label: string, value: string) => {
  const input = field(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
};

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

describe('지금 값으로 시작한다', () => {
  it('받은 값이 칸에 들어 있다', () => {
    open();

    expect(field('기본 배송비')).toHaveValue(3000);
    expect(field('무료배송 기준')).toHaveValue(50000);
    expect(field('제주·도서산간 추가 배송비')).toHaveValue(3000);
  });

  /** 빈 칸과 0 은 다른 뜻이다 — 무료배송을 안 하는 가게도 있다 */
  it('무료배송을 안 하면 그 칸은 비어 있다', () => {
    open({ freeThreshold: null });

    expect(field('무료배송 기준')).toHaveValue(null);
  });
});

/**
 * **계약이 막는 것을 화면이 먼저 말한다.** 서버도 막지만 눌러 보고 나서 알게 하지 않는다.
 */
describe('무료 기준은 기본료보다 커야 한다', () => {
  it('기본료보다 낮으면 저장할 수 없고 까닭을 적는다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '2000');

    expect(save()).toBeDisabled();
    expect(screen.getByText('기본 배송비보다 큰 금액이어야 합니다.')).toBeDefined();
  });

  /** 경계는 "큰" 이다 — 같으면 사실상 언제나 무료인데 조건이 있는 것처럼 적힌다 */
  it('기본료와 같아도 저장할 수 없다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '3000');

    expect(save()).toBeDisabled();
  });

  it('1원이라도 크면 저장할 수 있다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '3001');

    expect(save()).toBeEnabled();
    expect(screen.queryByText('기본 배송비보다 큰 금액이어야 합니다.')).toBeNull();
  });

  /*
   * 적어 둔 말이 할 수 없는 일을 가리키고 있었다 — 계약은 0 을 언제나 거절한다.
   * 언제나 무료로 하려면 기본 배송비를 0 으로 적는 것이 그 길이다.
   */
  it('0 을 "언제나 무료" 라고 적어 두지 않는다', () => {
    open();

    const hint = screen.getByText(/비워 두면 무료배송을 하지 않습니다/);
    expect(hint.textContent).not.toContain("0 은 '언제나 무료'");
    expect(hint).toHaveTextContent('기본 배송비를 0 으로 적습니다');
  });

  it('0 은 저장할 수 없다 — 서버가 언제나 거절하는 값이다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '0');

    expect(save()).toBeDisabled();
  });

  /** 비워 두는 것은 "무료배송 없음" 이라 그 규칙과 무관하다 */
  it('비워 두면 저장할 수 있다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '');

    expect(save()).toBeEnabled();
  });

  it('기본료를 내려도 다시 셈한다', async () => {
    open({ baseFee: 3000, freeThreshold: 50000 });

    await retype('무료배송 기준', '2000');
    expect(save()).toBeDisabled();

    await retype('기본 배송비', '1000');

    expect(save()).toBeEnabled();
  });
});

describe('보냈을 때', () => {
  it('세 값을 함께 보낸다', async () => {
    open();

    await retype('기본 배송비', '2500');
    await userEvent.click(save());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/shipping');
    expect(JSON.parse((init as RequestInit).body as string))
      .toEqual({ baseFee: 2500, freeThreshold: 50000, remoteSurcharge: 3000 });
  });

  /** 빈 칸은 null 로 보낸다 — 0 과 다른 뜻이다 */
  it('무료 기준을 비우면 null 로 보낸다', async () => {
    open();

    await retype('무료배송 기준', '');
    await userEvent.click(save());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ freeThreshold: null });
  });

  it('되면 지금부터 적용된다는 것을 말한다', async () => {
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('status')).toHaveTextContent('지금부터 이 값으로 계산합니다');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('보내는 동안 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await userEvent.click(save());

    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('거절당하면 그 까닭을 말한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '무료 기준은 기본 배송비보다 커야 합니다.' }, 422));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert'))
      .toHaveTextContent('무료 기준은 기본 배송비보다 커야 합니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(save());

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
