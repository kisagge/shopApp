// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_IMAGE_BYTES } from '@shop/core';
import { BannerEditor, type BannerItem } from '~/app/admin/banners/banner-editor';

/**
 * 홈 배너 편집 — **손님이 가장 먼저 보는 자리.**
 *
 * 컴포넌트 검사가 한 줄도 없었다(`manage-banner.test.ts` 는 창구 쪽이다). 상품 사진 쪽에서
 * 고친 것과 **같은 모양이 그대로** 있었다.
 *
 * **삭제가 첫 누름에 바로 나갔다.** 지워지는 것은 홈 최상단에 떠 있는 것이고, 바로 옆이
 * '노출 중지' 와 위·아래 단추다. 이름표도 "3번째 배너 삭제" 뿐이라 낭독기로 듣는 사람은
 * 순번만 알고 눌렀다.
 *
 * **올리기 전에 크기를 재지 않았다.** 서버는 `MAX_IMAGE_BYTES` 로 거절하는데, 20MB 짜리를
 * 고르면 통째로 올린 뒤에야 거절당한다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const banner = (over: Partial<BannerItem> & { id: string; headline: string }): BannerItem => ({
  eyebrow: null, subcopy: null, ctaLabel: null, href: null,
  imageUrl: null, imageAlt: null, tone: 'sand', sortOrder: 0,
  isActive: true, startsAt: null, endsAt: null, status: 'LIVE',
  ...over,
});

const BANNERS = [
  banner({ id: 'b-1', headline: '가을 신상' }),
  banner({ id: 'b-2', headline: '겨울 준비', sortOrder: 1, isActive: false, status: 'PAUSED' }),
];

const open = (initial: BannerItem[] = BANNERS) => render(<BannerEditor initial={initial} />);

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

const file = (bytes: number) => {
  const f = new File(['x'], 'bg.jpg', { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply({ deleted: true }));
});

/**
 * **되돌릴 수 없으니 한 번 더 묻는다.** 홈 최상단에 떠 있는 것을 지우는 자리다.
 */
describe('지우기', () => {
  const askDelete = (what: string) =>
    userEvent.click(screen.getByRole('button', { name: `${what} 삭제` }));

  it('첫 누름으로는 지우지 않는다', async () => {
    open();

    await askDelete('가을 신상');

    expect(screen.getByText('지울까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 지운다', async () => {
    open();

    await askDelete('가을 신상');
    await userEvent.click(screen.getByRole('button', { name: '가을 신상 삭제 확인' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/admin/banners/b-1',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    expect(await screen.findByText('배너를 삭제했습니다.')).toBeDefined();
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await askDelete('가을 신상');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '가을 신상 삭제' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 이름표가 순번뿐이면 낭독기로 듣는 사람은 무엇을 지우는지 모른 채 누른다 */
  it('제목으로 무엇을 지우는지 말한다', () => {
    open();

    expect(screen.getByRole('button', { name: '가을 신상 삭제' })).toBeDefined();
    expect(screen.getByRole('button', { name: '겨울 준비 삭제' })).toBeDefined();
  });

  it('제목이 비었으면 몇 번째인지로 말한다', () => {
    open([banner({ id: 'b-1', headline: '' })]);

    expect(screen.getByRole('button', { name: '1번째 배너 삭제' })).toBeDefined();
  });

  it('못 지웠으면 까닭을 말하고 묻는 자리에 그대로 둔다', async () => {
    vi.stubGlobal('fetch', reply({ message: '노출 중인 배너는 지울 수 없습니다.' }, 409));
    open();

    await askDelete('가을 신상');
    await userEvent.click(screen.getByRole('button', { name: '가을 신상 삭제 확인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('노출 중인 배너는 지울 수 없습니다.');
    expect(screen.getByRole('button', { name: '가을 신상 삭제 확인' })).toBeDefined();
  });
});

describe('배경 이미지 올리기', () => {
  const chooseFor = async (position: number, f: File) =>
    userEvent.upload(screen.getAllByLabelText('배경 이미지 (선택)')[position]!, f);

  const uploadButton = (position: number) =>
    screen.getAllByRole('button', { name: '이미지 교체' })[position]!;

  it('상한을 한 값에서 뽑아 적는다', () => {
    open();

    expect(screen.getAllByText(new RegExp(`${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하`)).length)
      .toBeGreaterThan(0);
  });

  it('상한을 넘으면 보내지 않고 몇 MB 인지 말한다', async () => {
    open();

    await chooseFor(0, file(MAX_IMAGE_BYTES + 1));
    await userEvent.click(uploadButton(0));

    expect(await screen.findByRole('alert')).toHaveTextContent('5MB 를 넘을 수 없습니다');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('상한과 똑같은 크기는 올린다', async () => {
    vi.stubGlobal('fetch', reply(banner({ id: 'b-1', headline: '가을 신상', imageUrl: '/bg.jpg' })));
    open();

    await chooseFor(0, file(MAX_IMAGE_BYTES));
    await userEvent.click(uploadButton(0));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('고른 파일이 없으면 고르라고 말한다', async () => {
    open();

    await userEvent.click(uploadButton(0));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미지 파일을 선택해 주세요.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('올리면 그 배너의 창구로 보낸다', async () => {
    vi.stubGlobal('fetch', reply(banner({ id: 'b-2', headline: '겨울 준비', imageUrl: '/bg.jpg' })));
    open();

    await chooseFor(1, file(1000));
    await userEvent.click(uploadButton(1));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/banners/b-2/image');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 그것을 "네트워크 오류" 로 뭉뚱그리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await chooseFor(0, file(1000));
    await userEvent.click(uploadButton(0));

    expect(await screen.findByRole('alert')).toHaveTextContent('올리지 못했습니다.');
  });
});

describe('순서와 노출', () => {
  it('내린 뒤의 차례를 통째로 보낸다', async () => {
    vi.stubGlobal('fetch', reply({ banners: [BANNERS[1], BANNERS[0]] }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '1번째 배너를 뒤로' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      orderedIds: string[];
    };
    expect(body.orderedIds).toEqual(['b-2', 'b-1']);
  });

  it('끝에서는 더 옮길 수 없다', () => {
    open();

    expect(screen.getByRole('button', { name: '1번째 배너를 앞으로' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2번째 배너를 뒤로' })).toBeDisabled();
  });

  /** 지금 켜져 있는지에 따라 단추가 할 일을 말한다 — 같은 이름이면 무엇이 될지 모른다 */
  it('노출 단추가 지금 상태에 따라 다른 말을 한다', () => {
    open();

    expect(screen.getByRole('button', { name: '노출 중지' })).toBeDefined();
    expect(screen.getByRole('button', { name: '노출 시작' })).toBeDefined();
  });

  it('노출을 켜면 그 값만 보낸다', async () => {
    vi.stubGlobal('fetch', reply(banner({ id: 'b-2', headline: '겨울 준비', isActive: true })));
    open();

    await userEvent.click(screen.getByRole('button', { name: '노출 시작' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/banners/b-2');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ isActive: true });
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '노출 시작' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});
