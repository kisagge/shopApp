// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { RoleForm } from '~/app/admin/users/role-form';

/**
 * 권한 부여 — **누가 무엇을 볼 수 있는지 정하는 자리.**
 *
 * 검사가 한 줄도 없었다. 그리고 **화면이 아는 것을 눌러 본 뒤에야 알려 줬다.**
 *
 * 가맹점으로 올리면서 소속을 안 고르면 계약이 거절한다(`assignRoleSchema`). 그 까닭도 거기
 * 적혀 있다 — "소속 없는 가맹점 계정은 아무것도 볼 수 없다. 만들어 봐야 로그인만 되는 계정이
 * 된다." 이 폼의 머리말도 같은 말을 적어 두었다. **그런데 적용 단추는 그대로 눌렸다.**
 *
 * 이 저장소는 반대로 한다: 서버도 막지만 눌러 보고 나서 알게 하지 않는다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const MERCHANTS = [{ id: 'm-1', name: '스튜디오눈' }, { id: 'm-2', name: '아틀리에 케이' }];

/*
 * 속성을 펼쳐서 넘긴다. `role="CUSTOMER"` 라고 적으면 eslint 의 a11y 규칙이 그것을 ARIA
 * 역할로 보고 진다 — 이 조각의 속성 이름이 하필 role 일 뿐이다.
 */
const open = (over: Partial<Parameters<typeof RoleForm>[0]> = {}) =>
  render(
    <RoleForm
      {...{
        userId: 'u-1',
        userName: '장보영',
        role: 'CUSTOMER' as const,
        merchantId: null,
        merchants: MERCHANTS,
        ...over,
      }}
    />,
  );

const roleSelect = () => screen.getByLabelText('장보영 권한');
const apply = () => screen.getByRole('button', { name: '적용' });
const reasonBox = () => screen.getByLabelText('사유 (필수)');

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ role: 'ADMIN' }));
});

describe('바꿀 것이 없을 때', () => {
  it('적용할 수 없다', () => {
    open();

    expect(apply()).toBeDisabled();
  });

  it('사유 칸도 아직 묻지 않는다', () => {
    open();

    expect(screen.queryByLabelText('사유 (필수)')).toBeNull();
  });

  /** 못 바꾸는 사람이면 폼 대신 까닭이 선다 */
  it('바꿀 수 없는 상대면 그 까닭만 보인다', () => {
    open({ disabledReason: '자기 권한은 바꿀 수 없습니다.' });

    expect(screen.getByText('자기 권한은 바꿀 수 없습니다.')).toBeDefined();
    expect(screen.queryByRole('button', { name: '적용' })).toBeNull();
  });
});

/**
 * **사유는 감사 로그에 남는 값이다.** 나중에 "왜 이 사람이 관리자가 됐지" 를 답할 수 있어야 한다.
 */
describe('사유', () => {
  it('바꾸면 사유를 묻는다', async () => {
    open();

    await userEvent.selectOptions(roleSelect(), 'ADMIN');

    expect(reasonBox()).toBeDefined();
  });

  it('사유가 비면 적용할 수 없다', async () => {
    open();

    await userEvent.selectOptions(roleSelect(), 'ADMIN');

    expect(apply()).toBeDisabled();
  });

  /** 계약은 다듬은 뒤 한 글자를 요구한다 — 화면의 required 는 공백만 적은 것을 통과시킨다 */
  it('공백만 적어도 적용할 수 없다', async () => {
    open();

    await userEvent.selectOptions(roleSelect(), 'ADMIN');
    await userEvent.type(reasonBox(), '   ');

    expect(apply()).toBeDisabled();
  });

  it('적은 사유를 다듬어 보낸다', async () => {
    open();

    await userEvent.selectOptions(roleSelect(), 'ADMIN');
    await userEvent.type(reasonBox(), '  운영 인수인계  ');
    await userEvent.click(apply());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ reason: '운영 인수인계' });
  });
});

/**
 * **소속 없는 가맹점 계정은 로그인만 되는 계정이 된다.** 계약이 그 까닭을 적고 막는데,
 * 화면은 눌러 본 뒤에야 알려 줬다.
 */
describe('가맹점으로 올릴 때', () => {
  const toMerchant = async () => userEvent.selectOptions(roleSelect(), 'MERCHANT');

  it('소속 고르개가 나타난다', async () => {
    open();

    await toMerchant();

    expect(screen.getByLabelText('장보영 소속 가맹점')).toBeDefined();
  });

  it('소속을 안 고르면 적용할 수 없다', async () => {
    open();

    await toMerchant();
    await userEvent.type(reasonBox(), '입점 승인');

    expect(apply()).toBeDisabled();
  });

  /** 흐려진 단추만 두면 무엇이 모자란지 알 수 없다 */
  it('무엇이 모자라 못 누르는지 말한다', async () => {
    open();

    await toMerchant();

    expect(screen.getByText(/소속을 골라 주세요/)).toBeDefined();
    expect(screen.getByText(/로그인만 되는 계정이 됩니다/)).toBeDefined();
  });

  it('소속을 고르면 적용할 수 있고 함께 보낸다', async () => {
    open();

    await toMerchant();
    await userEvent.selectOptions(screen.getByLabelText('장보영 소속 가맹점'), 'm-2');
    await userEvent.type(reasonBox(), '입점 승인');
    await userEvent.click(apply());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/users/u-1/role');
    expect(JSON.parse((init as RequestInit).body as string))
      .toMatchObject({ role: 'MERCHANT', merchantId: 'm-2' });
  });

  /** 가맹점이 아닌 권한에 소속을 실어 보내면 계약이 거절한다 */
  it('가맹점이 아니면 소속을 보내지 않는다', async () => {
    open({ role: 'MERCHANT', merchantId: 'm-1' });

    await userEvent.selectOptions(roleSelect(), 'CUSTOMER');
    await userEvent.type(reasonBox(), '가맹 종료');
    await userEvent.click(apply());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ merchantId: null });
  });

  /** 소속만 바꾸는 것도 바꾸는 것이다 */
  it('권한은 그대로 두고 소속만 옮겨도 적용할 수 있다', async () => {
    open({ role: 'MERCHANT', merchantId: 'm-1' });

    await userEvent.selectOptions(screen.getByLabelText('장보영 소속 가맹점'), 'm-2');
    await userEvent.type(reasonBox(), '소속 이관');

    expect(apply()).toBeEnabled();
  });
});

describe('보냈을 때', () => {
  const change = async () => {
    await userEvent.selectOptions(roleSelect(), 'ADMIN');
    await userEvent.type(reasonBox(), '운영 인수인계');
  };

  it('되면 화면을 다시 받아 온다', async () => {
    open();
    await change();

    await userEvent.click(apply());

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('보내는 동안 눌리지 않는다', async () => {
    let release!: () => void;
    open();
    await change();

    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    await userEvent.click(apply());

    expect(screen.getByRole('button', { name: '적용 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('거절당하면 그 까닭을 말한다', async () => {
    open();
    await change();

    vi.stubGlobal('fetch', reply({ message: '자기 권한은 바꿀 수 없습니다.' }, 409));
    await userEvent.click(apply());

    expect(await screen.findByRole('alert')).toHaveTextContent('자기 권한은 바꿀 수 없습니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    open();
    await change();

    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    await userEvent.click(apply());

    expect(await screen.findByRole('alert')).toHaveTextContent('권한을 바꾸지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    open();
    await change();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    await userEvent.click(apply());

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
