// @vitest-environment jsdom
import { render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_PRODUCT } from '@shop/core';
import { ImageManager, type ImageRow } from '~/app/admin/products/image-manager';

/**
 * 상품 이미지 관리 — **손님이 보는 사진을 올리고 치우는 자리.**
 *
 * 컴포넌트 검사가 한 줄도 없었다(`manage-images.test.ts` 는 창구·저장소 쪽이다). 둘이 있었다.
 *
 * **하나, 화면이 "5MB 이하" 라고 적어 두고 재지 않았다.** 20MB 짜리를 고르면 통째로 올린 뒤
 * 서버가 거절한다 — 느린 회선에서는 몇 분을 기다렸다가 거절을 본다. 그 숫자도 손으로 적혀
 * 있어서, 서버가 거절하는 기준(`MAX_IMAGE_BYTES`)과 갈릴 수 있었다.
 *
 * **둘, 삭제가 첫 누름에 바로 나갔다.** 저장소에서 사라지고 되돌릴 길이 없는데, 옆의 위·아래
 * 단추와 같은 줄에 붙어 있다. 이 저장소의 다른 지우기들은 전부 한 번 더 묻는다.
 */

const refresh = vi.hoisted(() => vi.fn());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

const row = (id: string, alt: string, sortOrder: number): ImageRow =>
  ({ id, url: `/img/${id}.jpg`, alt, sortOrder });

const IMAGES = [row('i-1', '정면', 0), row('i-2', '뒷면', 1)];

const open = (over: { initial?: ImageRow[]; storageConfigured?: boolean } = {}) =>
  render(
    <ImageManager
      productId="p-1"
      initial={over.initial ?? IMAGES}
      storageConfigured={over.storageConfigured ?? true}
    />,
  );

const file = (bytes: number, name = 'shot.jpg') => {
  const f = new File(['x'], name, { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
};

const choose = async (f: File) =>
  userEvent.upload(screen.getByLabelText('이미지 추가'), f);

const reply = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', reply(row('i-3', '옆면', 2)));
});

/**
 * **적어 둔 상한은 적은 자리에서 지킨다.** 서버도 막지만, 올라가지도 않을 파일을 다 보내고
 * 나서 알게 하지 않는다.
 */
describe('올리기 전에 재는 것', () => {
  it('상한을 한 값에서 뽑아 적는다 — 손으로 적으면 서버와 갈린다', () => {
    open();

    const mb = MAX_IMAGE_BYTES / 1024 / 1024;
    expect(screen.getByText(new RegExp(`${mb}MB 이하`))).toBeDefined();
    expect(screen.getByText(new RegExp(`상품당 ${MAX_IMAGES_PER_PRODUCT}장`))).toBeDefined();
  });

  it('상한을 넘으면 보내지 않고, 고른 파일이 몇 MB 인지 말한다', async () => {
    open();

    await choose(file(MAX_IMAGE_BYTES + 1, 'huge.jpg'));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('5MB 를 넘을 수 없습니다');
    expect(screen.getByRole('alert')).toHaveTextContent('5.0MB');
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 경계는 "이하" 다 — 딱 맞는 파일은 올라가야 한다 */
  it('상한과 똑같은 크기는 올린다', async () => {
    open();

    await choose(file(MAX_IMAGE_BYTES));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('고른 파일이 없으면 고르라고 말한다', async () => {
    open();

    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('이미지 파일을 선택해 주세요.');
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 받는 형식을 입력 자체가 말한다 — 고르는 창에서 걸러진다 */
  it('받는 형식을 파일 칸이 스스로 말한다', () => {
    open();

    expect(screen.getByLabelText('이미지 추가'))
      .toHaveAttribute('accept', 'image/jpeg,image/png,image/webp,image/avif');
  });

  it('한도에 도달하면 더 못 고르게 하고 그 사실을 적는다', () => {
    open({ initial: Array.from({ length: MAX_IMAGES_PER_PRODUCT }, (_, i) => row(`i-${i}`, `사진 ${i}`, i)) });

    expect(screen.getByLabelText('이미지 추가')).toBeDisabled();
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled();
    expect(screen.getByText(/한도에 도달했습니다/)).toBeDefined();
  });

  /** 저장소가 없으면 올릴 길이 없다 — 눌러 보고 알게 하지 않는다 */
  it('저장소가 없으면 올릴 수 없다', () => {
    open({ storageConfigured: false });

    expect(screen.getByLabelText('이미지 추가')).toBeDisabled();
    expect(screen.getByRole('button', { name: '업로드' })).toBeDisabled();
  });
});

describe('올릴 때', () => {
  it('고른 파일을 그 상품으로 보낸다', async () => {
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/products/p-1/images');
    expect((init as RequestInit).method).toBe('POST');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  it('올리고 나면 몇 장이 됐는지 말한다', async () => {
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByText(/현재 3장/)).toBeDefined();
  });

  it('올리는 동안 단추가 이름을 바꾼다', async () => {
    let release!: () => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => {
      release = () => resolve(new Response(JSON.stringify(row('i-3', '옆면', 2)), { status: 200 }));
    })));
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(screen.getByRole('button', { name: '올리는 중…' })).toBeDefined();
    release();
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('서버가 거절하면 그 까닭을 그대로 전한다', async () => {
    vi.stubGlobal('fetch', reply({ message: '파일 내용이 이미지가 아닙니다.' }, 400));
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('파일 내용이 이미지가 아닙니다.');
    expect(refresh).not.toHaveBeenCalled();
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 그것을 "네트워크 오류" 로 뭉뚱그리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('처리하지 못했습니다.');
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await choose(file(1000));
    await userEvent.click(screen.getByRole('button', { name: '업로드' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});

/**
 * **되돌릴 수 없으니 한 번 더 묻는다.** 저장소에서 사라지고, 옆의 위·아래 단추와 같은 줄이라
 * 손이 미끄러지기 쉽다.
 */
describe('지우기', () => {
  const askDelete = async (what: string) =>
    userEvent.click(screen.getByRole('button', { name: `${what} 삭제` }));

  it('첫 누름으로는 지우지 않는다', async () => {
    open();

    await askDelete('정면');

    expect(screen.getByText('지울까요?')).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 지운다', async () => {
    vi.stubGlobal('fetch', reply({ images: [row('i-2', '뒷면', 0)] }));
    open();

    await askDelete('정면');
    await userEvent.click(screen.getByRole('button', { name: '정면 삭제 확인' }));

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      '/api/admin/products/p-1/images/i-1',
      expect.objectContaining({ method: 'DELETE' }),
    ));
    expect(await screen.findByText('이미지를 삭제했습니다.')).toBeDefined();
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    open();

    await askDelete('정면');
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '정면 삭제' })).toBeDefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  /*
   * **무엇을 지우는지 말한다.** 이름표가 "3번째 이미지 삭제" 뿐이면 낭독기로 듣는 사람은
   * 순번만 알고 누른다.
   */
  it('대체 텍스트가 있으면 그것으로 어떤 사진인지 말한다', () => {
    open();

    expect(screen.getByRole('button', { name: '정면 삭제' })).toBeDefined();
    expect(screen.getByRole('button', { name: '뒷면 삭제' })).toBeDefined();
  });

  it('대체 텍스트가 비었으면 몇 번째인지로 말한다', () => {
    open({ initial: [row('i-1', '', 0)] });

    expect(screen.getByRole('button', { name: '1번째 이미지 삭제' })).toBeDefined();
  });

  it('못 지웠으면 까닭을 말하고 묻는 자리에 그대로 둔다', async () => {
    vi.stubGlobal('fetch', reply({ message: '대표 이미지는 지울 수 없습니다.' }, 409));
    open();

    await askDelete('정면');
    await userEvent.click(screen.getByRole('button', { name: '정면 삭제 확인' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('대표 이미지는 지울 수 없습니다.');
    expect(screen.getByRole('button', { name: '정면 삭제 확인' })).toBeDefined();
  });
});

/**
 * 순서는 드래그가 아니라 **위/아래 단추**로 바꾼다. 드래그는 키보드로 쓸 수 없고 터치에서도
 * 스크롤과 싸운다.
 */
describe('순서 바꾸기', () => {
  it('내린 뒤의 차례를 통째로 보낸다', async () => {
    vi.stubGlobal('fetch', reply({ images: [row('i-2', '뒷면', 0), row('i-1', '정면', 1)] }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '1번째 이미지를 뒤로' }));

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const body = JSON.parse((vi.mocked(fetch).mock.calls[0]![1] as RequestInit).body as string) as {
      orderedIds: string[];
    };
    expect(body.orderedIds).toEqual(['i-2', 'i-1']);
  });

  it('옮기고 나면 몇 번째로 갔는지 말한다', async () => {
    vi.stubGlobal('fetch', reply({ images: [row('i-2', '뒷면', 0), row('i-1', '정면', 1)] }));
    open();

    await userEvent.click(screen.getByRole('button', { name: '1번째 이미지를 뒤로' }));

    expect(await screen.findByText(/정면 을\(를\) 2번째로 옮겼습니다/)).toBeDefined();
  });
});
