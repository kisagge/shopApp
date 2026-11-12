// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from './render';
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

/**
 * **계약이 막는 것을 화면이 먼저 말한다.**
 *
 * 둘 다 서버가 거절한다. 그런데 눌러 본 뒤에야 알려 줬다 — 이 저장소는 반대로 한다.
 */
describe('저장하기 전에 거르는 것', () => {
  const card = () => screen.getAllByLabelText('버튼 문구 (선택)')[0]!;
  const saveButton = () => screen.getAllByRole('button', { name: '내용 저장' })[0]!;

  /** 링크 없는 버튼은 눌러도 아무 데도 안 가는 단추가 손님 화면 맨 위에 서는 것이다 */
  it('버튼 문구만 적고 링크를 비우면 저장할 수 없다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    await userEvent.type(card(), '지금 보기');

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('버튼 문구를 적었으면 링크도 적어 주세요.')).toBeDefined();
  });

  it('링크까지 적으면 저장할 수 있다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    await userEvent.type(card(), '지금 보기');
    await userEvent.type(screen.getAllByLabelText('링크')[0]!, '/collections/autumn');

    expect(saveButton()).toBeEnabled();
  });

  it('둘 다 비우면 아무 말도 하지 않는다 — 버튼은 선택이다', () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('버튼 문구를 적었으면 링크도 적어 주세요.')).toBeNull();
  });

  /** 거꾸로 적으면 영영 안 뜨는 배너가 된다 */
  it('종료가 시작보다 앞서면 저장할 수 없다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    fireEvent.change(screen.getAllByLabelText(/^시작/)[0]!, { target: { value: '2026-12-01T00:00' } });
    fireEvent.change(screen.getAllByLabelText(/^종료/)[0]!, { target: { value: '2026-11-01T00:00' } });

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('종료는 시작보다 뒤여야 합니다.')).toBeDefined();
  });

  it('같은 시각이어도 저장할 수 없다 — 한순간도 안 뜬다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    fireEvent.change(screen.getAllByLabelText(/^시작/)[0]!, { target: { value: '2026-12-01T00:00' } });
    fireEvent.change(screen.getAllByLabelText(/^종료/)[0]!, { target: { value: '2026-12-01T00:00' } });

    expect(saveButton()).toBeDisabled();
  });

  it('차례가 맞으면 저장할 수 있다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    fireEvent.change(screen.getAllByLabelText(/^시작/)[0]!, { target: { value: '2026-11-01T00:00' } });
    fireEvent.change(screen.getAllByLabelText(/^종료/)[0]!, { target: { value: '2026-12-01T00:00' } });

    expect(saveButton()).toBeEnabled();
  });

  /** 기간은 대개 비워 둔다 — 비운 것을 거르면 정상 입력이 막힌다 */
  it('한쪽만 적은 것은 막지 않는다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    fireEvent.change(screen.getAllByLabelText(/^종료/)[0]!, { target: { value: '2026-11-01T00:00' } });

    expect(saveButton()).toBeEnabled();
  });
});

describe('배너 추가', () => {
  it('맨 뒤에 붙이고 내용을 채우라고 알린다 — 빈 배너가 그대로 뜨면 안 된다', async () => {
    const created = banner({ id: 'b-3', headline: '', sortOrder: 2, isActive: false, status: 'PAUSED' });
    vi.stubGlobal('fetch', reply(created));
    open();

    await userEvent.click(screen.getByRole('button', { name: '배너 추가' }));

    await waitFor(() => expect(screen.getAllByLabelText(/^제목/)).toHaveLength(3));
    // 새것은 맨 뒤다 — 홈 최상단에 빈 배너가 끼어들면 손님이 먼저 그것을 본다
    const titles = screen.getAllByLabelText(/^제목/).map((el) => (el as HTMLTextAreaElement).value);
    expect(titles).toEqual(['가을 신상', '겨울 준비', '']);
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('/api/admin/banners');
    expect((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).method).toBe('POST');
    expect(document.querySelector('[aria-live="polite"]')!.textContent)
      .toBe('배너를 추가했습니다. 내용을 채운 뒤 노출을 켜 주세요.');
    expect(refresh).toHaveBeenCalled();
  });

  it('여섯 개면 더 못 만들고 그 사실을 단추가 말한다', () => {
    open(Array.from({ length: 6 }, (_, i) => banner({ id: `b-${i}`, headline: `배너 ${i}`, sortOrder: i })));

    const add = screen.getByRole('button', { name: '6개까지' });
    expect(add).toBeDisabled();
    expect(screen.queryByRole('button', { name: '배너 추가' })).toBeNull();
  });

  it('못 만들었으면 목록을 건드리지 않는다', async () => {
    vi.stubGlobal('fetch', reply({ message: '배너가 너무 많습니다.' }, 409));
    open();

    await userEvent.click(screen.getByRole('button', { name: '배너 추가' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('배너가 너무 많습니다.'));
    expect(screen.getAllByLabelText(/^제목/)).toHaveLength(2);
  });
});

describe('앞으로 옮기기', () => {
  it('올린 뒤의 차례도 통째로 보낸다 — 내리기만 되는 것이 아니다', async () => {
    vi.stubGlobal('fetch', reply({ banners: [BANNERS[1], BANNERS[0]] }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '2번째 배너를 앞으로' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      orderedIds: string[];
    };
    expect(body.orderedIds).toEqual(['b-2', 'b-1']);
  });

  it('못 옮겼으면 차례를 그대로 둔다 — 눈앞에서만 바뀌면 다음 끌어놓기가 어긋난다', async () => {
    vi.stubGlobal('fetch', reply({ message: '이미 바뀐 차례입니다.' }, 409));
    open();

    await userEvent.click(screen.getByRole('button', { name: '1번째 배너를 뒤로' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('이미 바뀐 차례입니다.'));
    const titles = screen.getAllByLabelText(/^제목/).map((el) => (el as HTMLTextAreaElement).value);
    expect(titles, '창구가 거절했는데 눈앞에서는 바뀌어 있다').toEqual(['가을 신상', '겨울 준비']);
  });
});

describe('적은 내용을 보내는 모양', () => {
  const save = async () => {
    await userEvent.click(screen.getAllByRole('button', { name: '내용 저장' })[0]!);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    return JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as
      Record<string, unknown>;
  };

  beforeEach(() => {
    // 저장 창구는 **배너 하나**를 돌려준다(목록이 아니다)
    vi.stubGlobal('fetch', reply(banner({ id: 'b-1', headline: '가을 신상' })));
  });

  it('선택인 칸은 다듬어 보내고, 비면 비운 것으로 보낸다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    await userEvent.type(screen.getByLabelText(/^윗줄/), '  EDITORIAL · 01  ');
    await userEvent.type(screen.getByLabelText(/^설명/), '   ');

    const body = await save();
    expect(body.eyebrow).toBe('EDITORIAL · 01');
    expect(body.subcopy).toBeNull();
  });

  it('제목은 다듬지 않는다 — 띄어쓰기도 디자인이다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    await userEvent.type(screen.getByLabelText(/^제목/), '  ');

    expect((await save()).headline).toBe('가을 신상  ');
  });

  it('배경 톤도 고른 값으로 간다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상', tone: 'sand' })]);

    await userEvent.selectOptions(screen.getByLabelText('배경 톤'), 'clay');

    expect((await save()).tone).toBe('clay');
  });

  it('기간은 한국 시각으로 받아 세계 시각으로 보낸다', async () => {
    /*
     * **칸은 시간대를 모른다.** `datetime-local` 은 "2026-10-01 09:00" 같은 글자일
     * 뿐이라, 읽는 쪽이 어느 시간대로 볼지 정해야 한다. 운영자는 한국 시각으로
     * 적는다 — 그걸 그대로 UTC 로 읽으면 배너가 **아홉 시간 늦게** 뜬다.
     */
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    fireEvent.change(screen.getByLabelText(/^시작/), { target: { value: '2026-10-01T09:00' } });
    fireEvent.change(screen.getByLabelText(/^종료/), { target: { value: '2026-10-31T23:59' } });

    const body = await save();
    expect(body.startsAt).toBe('2026-10-01T00:00:00.000Z');
    expect(body.endsAt).toBe('2026-10-31T14:59:00.000Z');
  });

  it('기간을 비우면 비운 채로 보낸다 — 늘 뜨는 배너다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상', startsAt: '2026-10-01T00:00:00.000Z' })]);

    fireEvent.change(screen.getByLabelText(/^시작/), { target: { value: '' } });

    expect((await save()).startsAt).toBeNull();
  });

  it('이미 들어 있는 기간은 한국 시각으로 보여 준다 — 적은 것과 같은 수가 보여야 한다', async () => {
    open([banner({ id: 'b-1', headline: '가을 신상', startsAt: '2026-10-01T00:00:00.000Z' })]);

    expect(screen.getByLabelText(/^시작/)).toHaveValue('2026-10-01T09:00');
  });
});

describe('모양이 틀린 200', () => {
  /*
   * **제네릭은 컴파일 때까지만 지킨다.** 200 인데 배너가 아닌 몸통이 오면 그대로
   * 목록에 들어가고, 그 줄을 그리는 자리에서 `headline.trim()` 이 터져 **화면이
   * 통째로 날아간다** — 오류 문구가 뜨는 것이 아니라 아무것도 안 뜬다.
   * 이 검사를 쓰다 흉내의 모양을 틀리게 주어 그대로 재현했다.
   */
  it('배너가 아닌 몸통은 목록에 넣지 않고 말로 알린다', async () => {
    vi.stubGlobal('fetch', reply({ ok: true }));
    open([banner({ id: 'b-1', headline: '가을 신상' })]);

    await userEvent.click(screen.getByRole('button', { name: '내용 저장' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
    expect(screen.getByLabelText(/^제목/)).toHaveValue('가을 신상');
  });

  it('만들 때도 같다 — 빈 줄이 목록에 끼지 않는다', async () => {
    vi.stubGlobal('fetch', reply({ ok: true }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '배너 추가' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
    expect(screen.getAllByLabelText(/^제목/)).toHaveLength(2);
  });

  it('차례를 받을 때도 줄마다 본다', async () => {
    vi.stubGlobal('fetch', reply({ banners: [{ nope: true }] }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '1번째 배너를 뒤로' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('처리하지 못했습니다.'));
    const titles = screen.getAllByLabelText(/^제목/).map((el) => (el as HTMLTextAreaElement).value);
    expect(titles).toEqual(['가을 신상', '겨울 준비']);
  });
});
