// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from './render';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MAX_IMAGE_BYTES } from '@shop/core';
import { CollectionCard } from '~/app/admin/collections/collection-card';
import type { CollectionItem } from '~/app/admin/collections/types';

/**
 * 기획전 한 장 — **손님 화면의 진열 하나.**
 *
 * 컴포넌트 검사가 한 줄도 없었다. 올리기 자리가 상품 사진·홈 배너와 **같은 모양**이었다:
 * 서버는 `MAX_IMAGE_BYTES` 로 거절하는데 화면은 재지 않아, 20MB 짜리를 고르면 통째로 올린
 * 뒤에야 거절당한다. 세 번째 같은 자리다.
 */

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));
vi.mock('~/app/admin/collections/product-picker', () => ({
  ProductPicker: () => <div />,
}));

const item: CollectionItem = {
  id: 'c-1', slug: 'autumn', title: '가을 기획전', subtitle: null, description: null,
  imageUrl: null, imageAlt: null, tone: 'sand', sortOrder: 0, isActive: true,
  startsAt: null, endsAt: null, status: 'LIVE', itemCount: 3, products: [],
};

const handlers = () => ({
  onSave: vi.fn(), onSaveProducts: vi.fn(), onDelete: vi.fn(), onUploaded: vi.fn(),
});

const open = (over: Partial<CollectionItem> = {}, busy = false) => {
  const h = handlers();
  render(<CollectionCard item={{ ...item, ...over }} busy={busy} {...h} />);
  return h;
};

const file = (bytes: number) => {
  const f = new File(['x'], 'bg.jpg', { type: 'image/jpeg' });
  Object.defineProperty(f, 'size', { value: bytes });
  return f;
};

const choose = (f: File) => userEvent.upload(screen.getByLabelText('배경 이미지 (선택)'), f);
const uploadButton = () => screen.getByRole('button', { name: '이미지 교체' });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ imageUrl: '/bg.jpg' }), { status: 200 })));
});

/**
 * **적어 둔 상한은 적은 자리에서 지킨다.** 서버도 막지만, 올라가지도 않을 파일을 다 보내고
 * 나서 알게 하지 않는다.
 */
describe('배경 이미지 올리기', () => {
  it('상한을 한 값에서 뽑아 적는다', () => {
    open();

    expect(screen.getByText(new RegExp(`${MAX_IMAGE_BYTES / 1024 / 1024}MB 이하`))).toBeDefined();
  });

  it('상한을 넘으면 보내지 않고 몇 MB 인지 말한다', async () => {
    open();

    await choose(file(MAX_IMAGE_BYTES + 1));
    await userEvent.click(uploadButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('5MB 를 넘을 수 없습니다');
    expect(screen.getByRole('alert')).toHaveTextContent('5.0MB');
    expect(fetch).not.toHaveBeenCalled();
  });

  /** 경계는 "이하" 다 — 딱 맞는 파일은 올라가야 한다 */
  it('상한과 똑같은 크기는 올린다', async () => {
    open();

    await choose(file(MAX_IMAGE_BYTES));
    await userEvent.click(uploadButton());

    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it('고른 파일이 없으면 고르라고 말한다', async () => {
    open();

    await userEvent.click(uploadButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('이미지 파일을 선택해 주세요.');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('올리면 그 기획전의 창구로 보낸다', async () => {
    const h = open();

    await choose(file(1000));
    await userEvent.click(uploadButton());

    await waitFor(() => expect(h.onUploaded).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/admin/collections/c-1/image');
    expect((init as RequestInit).body).toBeInstanceOf(FormData);
  });

  /** 502 가 HTML 을 주면 json() 이 터진다 — 서버가 답한 것을 네트워크 탓으로 돌리지 않는다 */
  it('응답이 JSON 이 아니어도 네트워크 오류라고 하지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>502</html>', { status: 502 })));
    const h = open();

    await choose(file(1000));
    await userEvent.click(uploadButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('올리지 못했습니다.');
    expect(h.onUploaded).not.toHaveBeenCalled();
  });

  it('길이 끊기면 그렇다고 말한다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    open();

    await choose(file(1000));
    await userEvent.click(uploadButton());

    expect(await screen.findByRole('alert')).toHaveTextContent('네트워크 오류');
  });
});

/**
 * **지우기는 한 번 더 묻는다.** 담아 둔 상품 목록과 문구·사진이 함께 사라지고, 바로 옆이
 * '노출 중지' 라 내리려다 지우기 좋은 자리다.
 */
describe('지우기', () => {
  it('첫 누름으로는 지우지 않는다', async () => {
    const h = open();

    await userEvent.click(screen.getByRole('button', { name: '가을 기획전 기획전 삭제' }));

    expect(screen.getByText('지울까요?')).toBeDefined();
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it('한 번 더 눌러야 지운다', async () => {
    const h = open();

    await userEvent.click(screen.getByRole('button', { name: '가을 기획전 기획전 삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '가을 기획전 기획전 삭제 확인' }));

    expect(h.onDelete).toHaveBeenCalledTimes(1);
  });

  it('물었다가 그만두면 아무 일도 없다', async () => {
    const h = open();

    await userEvent.click(screen.getByRole('button', { name: '가을 기획전 기획전 삭제' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '가을 기획전 기획전 삭제' })).toBeDefined();
    expect(h.onDelete).not.toHaveBeenCalled();
  });

  it('제목이 비었으면 그렇다고 부른다', async () => {
    open({ title: '' });

    expect(screen.getByRole('button', { name: '이 기획전 삭제' })).toBeDefined();
  });
});

describe('노출과 저장', () => {
  /** 지금 켜져 있는지에 따라 단추가 할 일을 말한다 — 같은 이름이면 무엇이 될지 모른다 */
  it('노출 단추가 지금 상태에 따라 다른 말을 한다', () => {
    open({ isActive: true });

    expect(screen.getByRole('button', { name: '노출 중지' })).toBeDefined();
  });

  it('꺼져 있으면 켜는 말을 한다', () => {
    open({ isActive: false });

    expect(screen.getByRole('button', { name: '노출 시작' })).toBeDefined();
  });

  it('노출을 바꾸면 그 값만 올린다', async () => {
    const h = open({ isActive: true });

    await userEvent.click(screen.getByRole('button', { name: '노출 중지' }));

    expect(h.onSave).toHaveBeenCalledWith({ isActive: false });
  });

  it('보내는 동안 저장이 눌리지 않는다', () => {
    open({}, true);

    expect(screen.getByRole('button', { name: '노출 중지' })).toBeDisabled();
  });
});

/**
 * **계약이 막는 것을 화면이 먼저 말한다.** 기간을 거꾸로 적으면 영영 안 뜨는 기획전이
 * 된다(`valid.endBeforeStart`). 서버도 막지만 눌러 보고 나서 알게 하지 않는다.
 */
describe('저장하기 전에 거르는 것', () => {
  const saveButton = () => screen.getByRole('button', { name: '내용 저장' });
  const setWindow = (start: string, end: string) => {
    if (start) fireEvent.change(screen.getByLabelText(/^시작/), { target: { value: start } });
    if (end) fireEvent.change(screen.getByLabelText(/^종료/), { target: { value: end } });
  };

  it('종료가 시작보다 앞서면 저장할 수 없다', () => {
    open();

    setWindow('2026-12-01T00:00', '2026-11-01T00:00');

    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('종료는 시작보다 뒤여야 합니다.')).toBeDefined();
  });

  it('같은 시각이어도 저장할 수 없다 — 한순간도 안 뜬다', () => {
    open();

    setWindow('2026-12-01T00:00', '2026-12-01T00:00');

    expect(saveButton()).toBeDisabled();
  });

  it('차례가 맞으면 저장할 수 있다', () => {
    open();

    setWindow('2026-11-01T00:00', '2026-12-01T00:00');

    expect(saveButton()).toBeEnabled();
    expect(screen.queryByText('종료는 시작보다 뒤여야 합니다.')).toBeNull();
  });

  /** 기간은 대개 비워 둔다 — 비운 것을 거르면 정상 입력이 막힌다 */
  it('한쪽만 적은 것은 막지 않는다', () => {
    open();

    setWindow('', '2026-11-01T00:00');

    expect(saveButton()).toBeEnabled();
  });
});
