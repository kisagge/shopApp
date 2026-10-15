// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MerchantBusinessForm } from '~/components/admin/merchant-business-form';

/**
 * 사업자 정보 — **돈 받는 주체를 적는 자리.**
 *
 * 가맹점 폼 넷 중 셋(수수료·설정·상태)에는 검사가 있는데 여기만 없었다. 읽어 보니 고칠
 * 것은 없었다 — 칸마다 까닭을 적고 **첫 틀린 칸으로 초점을 옮기며**, 서버가 돌려준 칸 오류도
 * 같은 길로 받는다. 그래서 그 생각들을 못 박는다.
 *
 * 정산과 세금계산서가 이 값을 근거로 삼는다. 조용히 어긋나면 돈이 다른 곳으로 간다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const initial = {
  name: '스튜디오눈',
  businessName: '스튜디오눈 주식회사',
  businessNumber: '123-45-67890',
  representative: '김대표',
};

const open = (over: Partial<typeof initial> = {}) =>
  render(<MerchantBusinessForm merchantId="m-1" initial={{ ...initial, ...over }} />);

const field = (label: string) => screen.getByLabelText(new RegExp(`^${label}`));
const save = () => userEvent.click(screen.getByRole('button', { name: '사업자 정보 저장' }));

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const retype = async (label: string, value: string) => {
  const input = field(label);
  await userEvent.clear(input);
  if (value) await userEvent.type(input, value);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ ok: true }));
});

describe('지금 값으로 시작한다', () => {
  it('받은 값이 칸에 들어 있다', () => {
    open();

    expect(field('가맹점 이름')).toHaveValue('스튜디오눈');
    expect(field('상호')).toHaveValue('스튜디오눈 주식회사');
    expect(field('사업자등록번호')).toHaveValue('123-45-67890');
    expect(field('대표자')).toHaveValue('김대표');
  });

  /** 매대에 뜨는 이름과 운영 화면에서 부르는 이름은 다르다 — 그 사실을 칸이 말한다 */
  it('가맹점 이름이 무엇을 가리키는지 적어 둔다', () => {
    open();

    expect(screen.getByText(/매대에 뜨는 것은 브랜드 이름입니다/)).toBeDefined();
  });
});

/**
 * **틀린 칸으로 초점을 옮긴다.** 까닭만 적어 두면 긴 폼에서는 어디가 틀렸는지 찾아 내려가야
 * 하고, 낭독기로 듣는 사람에게는 그 말이 아예 안 들린다.
 */
describe('보내기 전에 거르는 것', () => {
  it.each([
    ['가맹점 이름', '가맹점 이름을 입력해 주세요.'],
    ['상호', '상호를 입력해 주세요.'],
    ['대표자', '대표자 이름을 입력해 주세요.'],
  ])('%s 가 비면 까닭을 적고 보내지 않는다', async (label, message) => {
    open();

    await retype(label, '');
    await save();

    expect(screen.getByText(message)).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('사업자등록번호가 열 자리가 아니면 거른다', async () => {
    open();

    await retype('사업자등록번호', '12345');
    await save();

    expect(screen.getByText('사업자등록번호 10자리를 입력해 주세요.')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 하이픈을 빼고 적는 사람이 많다 — 거절하지 않는다(서버가 표준 표기로 맞춘다) */
  it('하이픈 없이 적어도 받는다', async () => {
    open();

    await retype('사업자등록번호', '1234567890');
    await save();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('틀린 칸이 여럿이면 첫 칸으로 초점을 옮긴다', async () => {
    open();

    await retype('상호', '');
    await retype('대표자', '');
    await save();

    // 화면에 놓인 차례대로 — 상호가 대표자보다 위다
    expect(field('상호')).toHaveFocus();
  });

  it('고치고 다시 보내면 지난 까닭은 사라진다', async () => {
    open();

    await retype('상호', '');
    await save();
    expect(screen.getByText('상호를 입력해 주세요.')).toBeDefined();

    await retype('상호', '새 상호');
    await save();

    await waitFor(() => expect(screen.queryByText('상호를 입력해 주세요.')).toBeNull());
  });
});

describe('보냈을 때', () => {
  it('고친 값을 그 가맹점으로 보낸다', async () => {
    open();

    await retype('대표자', '박대표');
    await save();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/merchants/m-1/settings');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ representative: '박대표' });
  });

  /** 돈 받는 주체가 바뀌는 자리다 — 기록이 남는다는 사실을 바꾼 사람에게 알린다 */
  it('감사 로그에 남는다는 것을 알린다', async () => {
    open();

    await save();

    expect(await screen.findByRole('status')).toHaveTextContent('감사 로그에 남습니다');
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  it('보내는 동안 단추가 이름을 바꾸고 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await save();

    expect(screen.getByRole('button', { name: '보내는 중…' })).toBeDisabled();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});

describe('못 보냈을 때', () => {
  it('서버가 말한 까닭을 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 쓰는 사업자등록번호입니다.' }, 409));
    open();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 쓰는 사업자등록번호입니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 서버가 칸을 짚어 주면 화면도 그 칸을 짚는다 — 어느 칸인지 다시 찾게 하지 않는다 */
  it('서버가 짚은 칸에 까닭을 적고 초점을 옮긴다', async () => {
    vi.stubGlobal('fetch', reply(
      { message: '고치지 못했습니다.', fields: { businessNumber: '이미 등록된 번호입니다.' } },
      422,
    ));
    open();

    await save();

    expect(await screen.findByText('이미 등록된 번호입니다.')).toBeDefined();
    expect(field('사업자등록번호')).toHaveFocus();
  });

  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다.');
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('저장하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await save();

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
