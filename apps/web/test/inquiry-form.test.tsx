// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const refresh = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const { InquiryForm } = await import('~/components/inquiry-form');
const { InquirySection } = await import('~/components/inquiry-section');

const fetchMock = vi.hoisted(() => vi.fn<(...a: any[]) => any>());

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockResolvedValue(new Response('{"id":"q-1"}', { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
});

const inquiry = (over: Record<string, unknown> = {}) => ({
  id: 'q-1', content: '재고 있나요', isPrivate: false, readable: true,
  authorName: '홍○동', createdAt: new Date('2026-09-01T00:00:00Z'),
  answer: null, answeredAt: null, isMine: false, canAnswer: false,
  ...over,
}) as any;

describe('문의 작성', () => {
  it('기본은 공개다', async () => {
    // 같은 것을 궁금해하는 사람이 다시 묻지 않아도 되는 것이 공개로 두는 이유다
    render(<InquiryForm productId="p-1" />);
    expect(screen.getByRole('checkbox')).toHaveProperty('checked', false);

    await userEvent.type(screen.getByRole('textbox'), '재고 있나요');
    await userEvent.click(screen.getByRole('button', { name: '문의 남기기' }));

    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).isPrivate).toBe(false);
  });

  it('비공개가 무엇인지 옆에서 말해 준다', () => {
    render(<InquiryForm productId="p-1" />);
    expect(screen.getByText(/나와 판매자만 볼 수 있습니다/)).toBeDefined();
  });

  it('너무 짧으면 보낼 수 없다', async () => {
    render(<InquiryForm productId="p-1" />);
    await userEvent.type(screen.getByRole('textbox'), '음');

    expect(screen.getByRole('button', { name: '문의 남기기' })).toHaveProperty('disabled', true);
  });

  it('실패하면 이유를 보여 주고 내용을 지우지 않는다', async () => {
    fetchMock.mockResolvedValue(new Response('{"message":"요청이 너무 잦습니다."}', { status: 429 }));
    render(<InquiryForm productId="p-1" />);
    await userEvent.type(screen.getByRole('textbox'), '재고 있나요');
    await userEvent.click(screen.getByRole('button', { name: '문의 남기기' }));

    expect(await screen.findByRole('alert')).toBeDefined();
    // 다시 쓰게 하면 안 된다
    expect(screen.getByRole('textbox')).toHaveProperty('value', '재고 있나요');
  });
});

describe('문의 목록', () => {
  it('로그인하지 않으면 양식 대신 안내를 보여 준다', () => {
    render(<InquirySection productId="p-1" inquiries={[]} loggedIn={false} />);

    expect(screen.getByText(/로그인 후 남기실 수 있습니다/)).toBeDefined();
    expect(screen.queryByRole('button', { name: '문의 남기기' })).toBeNull();
  });

  it('답변 여부를 글자로 알린다 — 색으로만 알리면 읽히지 않는다', () => {
    render(
      <InquirySection
        productId="p-1"
        inquiries={[inquiry(), inquiry({ id: 'q-2', answeredAt: new Date(), answer: '있습니다' })]}
        loggedIn={false}
      />,
    );

    expect(screen.getByText('답변 대기')).toBeDefined();
    expect(screen.getByText('답변 완료')).toBeDefined();
  });

  it('볼 수 없는 문의는 내용 자리에 대체 문구가 온다', () => {
    render(
      <InquirySection
        productId="p-1"
        inquiries={[inquiry({ isPrivate: true, readable: false, content: '비공개 문의입니다.' })]}
        loggedIn={false}
      />,
    );

    expect(screen.getByText('비공개 문의입니다.')).toBeDefined();
    expect(screen.getByLabelText('비공개 문의')).toBeDefined();
  });

  it('내 문의에만 삭제가 붙는다', () => {
    const { rerender } = render(
      <InquirySection productId="p-1" inquiries={[inquiry()]} loggedIn />,
    );
    expect(screen.queryByRole('button', { name: '내 문의 삭제' })).toBeNull();

    rerender(<InquirySection productId="p-1" inquiries={[inquiry({ isMine: true })]} loggedIn />);
    expect(screen.getByRole('button', { name: '내 문의 삭제' })).toBeDefined();
  });

  it('답할 수 있는 사람에게만 답변하기가 붙는다', () => {
    render(
      <InquirySection productId="p-1" inquiries={[inquiry({ canAnswer: true })]} loggedIn />,
    );
    expect(screen.getByRole('button', { name: '답변하기' })).toBeDefined();
  });

  it('이미 답이 달렸으면 답변하기가 없다', () => {
    render(
      <InquirySection
        productId="p-1"
        inquiries={[inquiry({ canAnswer: true, answeredAt: new Date(), answer: '있습니다' })]}
        loggedIn
      />,
    );
    expect(screen.queryByRole('button', { name: '답변하기' })).toBeNull();
  });
});
