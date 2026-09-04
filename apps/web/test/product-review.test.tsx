// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { ProductReview } = await import('~/components/admin/product-review');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});

const setup = () => render(<ProductReview productId="p-1" productName="오트 코트" />);
const body = () => JSON.parse(fetchMock.mock.calls[0]![1].body);

describe('게시', () => {
  it('사유 없이 곧바로 올린다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '게시' }));

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/admin/products/p-1/review',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(body()).toEqual({ approve: true, reason: null });
  });

  it('끝나면 목록을 다시 읽는다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '게시' }));
    expect(refresh).toHaveBeenCalled();
  });
});

describe('반려', () => {
  it('사유를 적기 전에는 보낼 수 없다', async () => {
    /*
     * 이유 없이 되돌리면 가맹점은 무엇을 고쳐야 할지 모르고, 그대로 다시
     * 올려서 같은 일이 반복된다. 서버도 막지만 눌러 본 뒤에 알게 하지 않는다.
     */
    setup();
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    expect(screen.getByRole('button', { name: '반려' })).toHaveProperty('disabled', true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('공백만 적어도 열리지 않는다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.type(screen.getByRole('textbox'), '   ');

    expect(screen.getByRole('button', { name: '반려' })).toHaveProperty('disabled', true);
  });

  it('어느 상품의 사유인지 이름으로 알린다', async () => {
    // 목록 안에 같은 모양의 입력칸이 여럿 있다. 이름이 없으면 어느 줄인지 모른다.
    setup();
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    expect(screen.getByLabelText('오트 코트 반려 사유')).toBeDefined();
  });

  it('사유를 적으면 보낸다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.type(screen.getByRole('textbox'), '사진이 흐립니다');
    await userEvent.click(screen.getByRole('button', { name: '반려' }));

    expect(body()).toEqual({ approve: false, reason: '사진이 흐립니다' });
  });

  it('취소하면 원래 자리로 돌아온다', async () => {
    setup();
    await userEvent.click(screen.getByRole('button', { name: '반려' }));
    await userEvent.click(screen.getByRole('button', { name: '취소' }));

    expect(screen.getByRole('button', { name: '게시' })).toBeDefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('실패', () => {
  it('서버가 말한 이유를 보여 준다', async () => {
    fetchMock.mockResolvedValue(
      new Response('{"message":"검수를 기다리는 상품이 아닙니다."}', { status: 409 }),
    );
    setup();
    await userEvent.click(screen.getByRole('button', { name: '게시' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('네트워크가 끊겨도 버튼이 잠기지 않는다', async () => {
    fetchMock.mockRejectedValue(new Error('오프라인'));
    setup();
    await userEvent.click(screen.getByRole('button', { name: '게시' }));

    await screen.findByRole('alert');
    expect(screen.getByRole('button', { name: '게시' })).toHaveProperty('disabled', false);
  });
});
