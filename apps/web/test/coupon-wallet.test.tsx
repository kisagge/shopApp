// @vitest-environment jsdom
import { render, screen, waitFor, within } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { CouponWallet } from '~/components/coupon-wallet';

/**
 * 쿠폰함 — **손님이 자기 돈이 얼마나 깎이는지 확인하러 오는 자리.**
 *
 * 검사가 한 줄도 없었다. 그리고 그 사이에 **받기가 성공한 길이 깨져 있었다.**
 * `event.currentTarget` 은 처리기가 끝나는 순간 리액트가 비우는데, 그것을 await 뒤에
 * `.reset()` 하고 있었다. 그래서 받기에 성공한 사람 화면에 "받았습니다" 와 "네트워크
 * 오류로 처리하지 못했습니다" 가 나란히 섰고, 그 줄에서 멈춰 목록 새로고침도 안 돌아
 * 쿠폰함은 비어 있었다. 다시 누르면 "이미 받았습니다" 가 뜬다 — 받은 적도 없는데.
 *
 * 서버는 아무 잘못이 없어 로그에도 안 남는다. **화면을 실제로 눌러 봐야만 보이는 종류다.**
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const coupon = (over: Partial<Parameters<typeof CouponWallet>[0]['initial'][number]> = {}) => ({
  id: 'uc-1',
  code: 'WELCOME10',
  name: '웰컴 10%',
  kind: 'PERCENT',
  value: 0,
  percent: 10,
  maxDiscount: null,
  minimumOrder: 0,
  usedAt: null,
  expiresAt: new Date('2026-12-31T14:59:59.000Z'),
  expired: false,
  ...over,
});

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const open = (initial: ReturnType<typeof coupon>[] = []) =>
  render(<CouponWallet initial={initial} />);

const claim = async (code = 'WELCOME10') => {
  await userEvent.type(screen.getByLabelText(/쿠폰 코드 등록/), code);
  await userEvent.click(screen.getByRole('button', { name: '등록' }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ name: '웰컴 10%' }));
});

describe('코드로 받기', () => {
  it('적은 코드를 서버로 보낸다', async () => {
    open();

    await claim('SUMMER20');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/coupons/claim');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'SUMMER20' });
  });

  /** 복사해 붙이면 앞뒤에 공백이 딸려 온다. 그것 때문에 "없는 코드" 가 되면 안 된다. */
  it('앞뒤 공백은 떼고 보낸다', async () => {
    open();

    await claim('  SUMMER20  ');

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'SUMMER20' });
  });

  it('받으면 무엇을 받았는지 이름으로 말한다', async () => {
    open();

    await claim();

    expect(await screen.findByText('웰컴 10%을(를) 받았습니다.')).toBeDefined();
  });

  /*
   * 여기가 고장이 있던 자리다. 성공한 길에서 null 을 건드려 터졌고, 그 예외를 catch 가
   * 받아 네트워크 오류라고 적었다. 성공과 실패가 한 화면에 같이 서면 사람은 무엇을
   * 믿어야 할지 알 수 없다.
   */
  it('받았으면 오류는 적지 않는다 — 둘이 같이 서면 믿을 것이 없다', async () => {
    open();

    await claim();

    await screen.findByText('웰컴 10%을(를) 받았습니다.');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  /** 새 쿠폰은 서버가 다시 그려 줘야 목록에 든다. 안 부르면 쿠폰함이 빈 채로 남는다. */
  it('받았으면 목록을 다시 받아 온다', async () => {
    open();

    await claim();

    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1));
  });

  /** 코드가 남아 있으면 같은 것을 또 누르게 된다 */
  it('받았으면 코드 칸을 비운다', async () => {
    open();

    await claim();

    await waitFor(() => expect(screen.getByLabelText(/쿠폰 코드 등록/)).toHaveValue(''));
  });

  it('이름을 안 알려 주면 그냥 "쿠폰" 이라고 한다 — 빈자리를 두지 않는다', async () => {
    vi.stubGlobal('fetch', reply({}));
    open();

    await claim();

    expect(await screen.findByText('쿠폰을(를) 받았습니다.')).toBeDefined();
  });
});

describe('받지 못했을 때', () => {
  it('서버가 말한 까닭을 그대로 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 받은 쿠폰입니다.' }, 409));
    open();

    await claim();

    expect(await screen.findByRole('alert')).toHaveTextContent('이미 받은 쿠폰입니다.');
  });

  /** 서버가 까닭을 안 주는 길도 있다(500). 빈 상자를 띄우면 아무것도 못 한다. */
  it('까닭이 없으면 우리 문장으로 말한다', async () => {
    vi.stubGlobal('fetch', reply({}, 500));
    open();

    await claim();

    expect(await screen.findByRole('alert')).toHaveTextContent('쿠폰을 받지 못했습니다.');
  });

  it('못 받았으면 받았다고 말하지 않는다', async () => {
    vi.stubGlobal('fetch', reply({ message: '없는 코드입니다.' }, 404));
    open();

    await claim();

    await screen.findByRole('alert');
    expect(screen.queryByText(/받았습니다/)).toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('길이 끊기면 네트워크 오류라고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await claim();

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });

  /** 실패한 코드는 지우지 않는다 — 오타 한 글자 때문에 다시 다 쳐야 하면 안 된다 */
  it('못 받았으면 적은 코드를 지우지 않는다', async () => {
    vi.stubGlobal('fetch', reply({ message: '없는 코드입니다.' }, 404));
    open();

    await claim('SUMMER20');

    await screen.findByRole('alert');
    expect(screen.getByLabelText(/쿠폰 코드 등록/)).toHaveValue('SUMMER20');
  });

  /** 다시 눌렀을 때 지난 오류가 남아 있으면 지금 것인지 알 수 없다 */
  it('다시 누르면 지난 오류는 치운다', async () => {
    vi.stubGlobal('fetch', reply({ message: '없는 코드입니다.' }, 404));
    open();
    await claim('NOPE');
    await screen.findByRole('alert');

    vi.stubGlobal('fetch', reply({ name: '웰컴 10%' }));
    await userEvent.click(screen.getByRole('button', { name: '등록' }));

    await screen.findByText('웰컴 10%을(를) 받았습니다.');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

/**
 * **보내는 동안 무슨 일이 일어나는지 말한다.** 아무 변화가 없으면 사람은 안 눌린 줄 알고
 * 다시 누른다.
 */
describe('보내는 동안', () => {
  it('단추가 이름을 바꾸고 다시 눌리지 않는다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response('{}', { status: 200 }));
    })));
    open();

    await claim();

    const button = screen.getByRole('button', { name: '받는 중…' });
    expect(button).toBeDisabled();

    release();
    await waitFor(() => expect(screen.getByRole('button', { name: '등록' })).toBeDefined());
  });
});

/**
 * **쓴 것과 기간이 지난 것도 지우지 않는다.** 조용히 사라지면 "분명히 있었는데" 가 되고,
 * 그건 그대로 문의가 된다.
 */
describe('가진 쿠폰 목록', () => {
  const row = (name: string) => screen.getByText(name).closest('li')!;

  it('아직 없으면 어떻게 하면 되는지 알려 준다', () => {
    open([]);

    expect(screen.getByText(/아직 받은 쿠폰이 없습니다/)).toBeDefined();
  });

  it('이름·할인·코드를 적는다', () => {
    open([coupon()]);

    const line = row('웰컴 10%');
    expect(within(line).getByText('10% 할인')).toBeDefined();
    expect(within(line).getByText('WELCOME10')).toBeDefined();
  });

  it('최소 주문 금액이 있으면 적는다 — 쓰려다 못 쓰면 그게 더 나쁘다', () => {
    open([coupon({ minimumOrder: 50_000 })]);

    expect(within(row('웰컴 10%')).getByText(/50,000원 이상/)).toBeDefined();
  });

  it('최소 금액이 없으면 그 말을 적지 않는다 — "0원 이상" 은 읽을 까닭이 없다', () => {
    open([coupon({ minimumOrder: 0 })]);

    expect(within(row('웰컴 10%')).queryByText(/이상/)).toBeNull();
  });

  /** 상태를 흐림으로만 알리면 색을 못 보는 사람에게는 똑같은 줄이다 */
  it('쓴 쿠폰은 글자로 "사용함" 이라고 적는다', () => {
    open([coupon({ usedAt: new Date('2026-10-01T00:00:00Z') })]);

    expect(within(row('웰컴 10%')).getByText('사용함')).toBeDefined();
  });

  it('기간이 지났으면 글자로 적는다', () => {
    open([coupon({ expired: true })]);

    expect(within(row('웰컴 10%')).getByText('기간 만료')).toBeDefined();
  });

  /** 쓴 쿠폰은 기간이 지나도 "사용함" 이다 — 두 뱃지가 같이 서면 무엇을 한 건지 모른다 */
  it('쓰고 나서 기간이 지난 것은 "사용함" 하나만 적는다', () => {
    open([coupon({ usedAt: new Date('2026-10-01T00:00:00Z'), expired: true })]);

    const line = row('웰컴 10%');
    expect(within(line).getByText('사용함')).toBeDefined();
    expect(within(line).queryByText('기간 만료')).toBeNull();
  });

  it('쓸 수 있는 쿠폰에는 아무 표도 안 붙는다', () => {
    open([coupon()]);

    const line = row('웰컴 10%');
    expect(within(line).queryByText('사용함')).toBeNull();
    expect(within(line).queryByText('기간 만료')).toBeNull();
  });

  /*
   * **만료일은 파는 곳의 시계로 읽는다.** UTC 로 읽으면 자정 가까운 쿠폰이 하루 당겨지고,
   * 서버와 브라우저가 다른 날짜를 그려 화면이 깜빡이며 바뀐다.
   */
  it('만료일을 한국 시각으로 읽는다', () => {
    // 2026-12-31 23:59:59 KST = 14:59:59 UTC. UTC 로 읽으면 12월 31일이 아니다
    open([coupon({ expiresAt: new Date('2026-12-31T14:59:59.000Z') })]);

    expect(within(row('웰컴 10%')).getByText(/2026/)).toHaveTextContent('12');
  });

  it('여러 장이면 받은 차례대로 세운다 — 순서는 서버가 정한다', () => {
    open([
      coupon({ id: 'uc-1', name: '웰컴 10%' }),
      coupon({ id: 'uc-2', name: '가을 5천원', code: 'FALL5000' }),
    ]);

    const names = screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(names[0]).toContain('웰컴 10%');
    expect(names[1]).toContain('가을 5천원');
  });

  /** 코드 칸만 두면 코드 없이 받을 수 있는 쿠폰이 있다는 것을 모른다 */
  it('받을 수 있는 쿠폰 목록으로 가는 길이 있다', () => {
    open([]);

    expect(screen.getByRole('link', { name: '받을 수 있는 쿠폰 보기' }))
      .toHaveAttribute('href', '/coupons');
  });
});
