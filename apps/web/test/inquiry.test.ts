import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Actor } from '@shop/core';

const db = vi.hoisted(() => ({
  product: { findFirst: vi.fn<(...a: any[]) => any>(), findUnique: vi.fn<(...a: any[]) => any>() },
  productInquiry: {
    create: vi.fn<(...a: any[]) => any>(),
    findFirst: vi.fn<(...a: any[]) => any>(),
    findMany: vi.fn<(...a: any[]) => any>(),
    count: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { createInquiry, answerInquiry, deleteInquiry } = await import('~/lib/inquiry/write');
const { getProductInquiries } = await import('~/lib/queries/inquiries');

const customer: Actor = { id: 'u-c', role: 'CUSTOMER', merchantId: null };
const other: Actor = { id: 'u-o', role: 'CUSTOMER', merchantId: null };
const merchantA: Actor = { id: 'u-a', role: 'MERCHANT', merchantId: 'm-a' };
const merchantB: Actor = { id: 'u-b', role: 'MERCHANT', merchantId: 'm-b' };
const admin: Actor = { id: 'u-adm', role: 'ADMIN', merchantId: null };

const inquiryRow = (over: Record<string, unknown> = {}) => ({
  id: 'q-1', authorId: 'u-c', answeredAt: null, content: '재고 있나요',
  product: { id: 'p-1', name: '울 코트', slug: 'wool-coat', brand: { merchantId: 'm-a' } },
  author: { email: 'c@plain.test', name: '홍길동' },
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findFirst.mockResolvedValue({ id: 'p-1' });
  db.product.findUnique.mockResolvedValue({ brand: { merchantId: 'm-a' } });
  db.productInquiry.create.mockResolvedValue({ id: 'q-1' });
  db.productInquiry.findFirst.mockResolvedValue(inquiryRow());
  db.productInquiry.update.mockResolvedValue({ id: 'q-1', answer: '있습니다' });
  db.productInquiry.findMany.mockResolvedValue([]);
});

describe('문의 작성', () => {
  const input = { productId: 'p-1', content: '재고 있나요', isPrivate: false };

  it('구매 이력을 보지 않는다 — 사기 전에 묻는 자리다', async () => {
    await createInquiry('u-c', input);

    // 주문·주문항목을 조회하지 않는다
    expect(db.product.findFirst).toHaveBeenCalled();
    expect(db.productInquiry.create).toHaveBeenCalled();
  });

  it('없는 상품에는 남기지 못한다', async () => {
    db.product.findFirst.mockResolvedValue(null);

    await expect(createInquiry('u-c', input)).rejects.toMatchObject({
      code: 'PRODUCT_NOT_FOUND', status: 404,
    });
  });

  it('비공개 여부를 그대로 저장한다', async () => {
    await createInquiry('u-c', { ...input, isPrivate: true });
    expect(db.productInquiry.create.mock.calls[0]![0].data.isPrivate).toBe(true);
  });
});

describe('답변', () => {
  const input = { answer: '있습니다' };

  it('자기 상품이면 답한다', async () => {
    const result = await answerInquiry(merchantA, 'q-1', input);

    expect(db.productInquiry.update.mock.calls[0]![0].data).toMatchObject({
      answer: '있습니다', answeredById: 'u-a',
    });
    // 알림에 필요한 것을 함께 돌려준다
    expect(result).toMatchObject({ authorEmail: 'c@plain.test', productSlug: 'wool-coat' });
  });

  it('남의 상품에는 답하지 못한다', async () => {
    await expect(answerInquiry(merchantB, 'q-1', input)).rejects.toMatchObject({
      code: 'NOT_ALLOWED', status: 403,
    });
    expect(db.productInquiry.update).not.toHaveBeenCalled();
  });

  it('고객은 답하지 못한다', async () => {
    await expect(answerInquiry(customer, 'q-1', input)).rejects.toMatchObject({
      code: 'NOT_ALLOWED',
    });
  });

  it('이미 답이 달렸으면 다시 답하지 않는다', async () => {
    /*
     * 답이 조용히 바뀌면 물어본 사람은 자기가 본 것이 무엇이었는지 알 수 없다.
     */
    db.productInquiry.findFirst.mockResolvedValue(inquiryRow({ answeredAt: new Date() }));

    await expect(answerInquiry(admin, 'q-1', input)).rejects.toMatchObject({
      code: 'ALREADY_ANSWERED', status: 409,
    });
  });
});

describe('삭제', () => {
  beforeEach(() => {
    db.productInquiry.findFirst.mockResolvedValue({ id: 'q-1', authorId: 'u-c' });
  });

  it('본인이 지우면 행을 없앤다', async () => {
    await deleteInquiry(customer, 'q-1');

    expect(db.productInquiry.delete).toHaveBeenCalledWith({ where: { id: 'q-1' } });
    expect(db.productInquiry.update).not.toHaveBeenCalled();
  });

  it('운영진이 내리면 표시만 한다 — 분쟁 때 원본이 있어야 한다', async () => {
    await deleteInquiry(admin, 'q-1');

    expect(db.productInquiry.update.mock.calls[0]![0].data.deletedAt).toBeInstanceOf(Date);
    expect(db.productInquiry.delete).not.toHaveBeenCalled();
  });

  it('남은 지우지 못한다', async () => {
    await expect(deleteInquiry(other, 'q-1')).rejects.toMatchObject({
      code: 'NOT_OWN_INQUIRY', status: 403,
    });
  });
});

describe('비공개 문의는 서버에서 지운 채 내려간다', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'q-1', content: '치수가 어떻게 되나요', isPrivate: true,
    createdAt: new Date('2026-09-01'), answer: '160 입니다', answeredAt: new Date('2026-09-02'),
    authorId: 'u-c', author: { name: '홍길동' },
    ...over,
  });

  it('남에게는 내용을 아예 주지 않는다', async () => {
    /*
     * 화면에서 감추기만 하면 HTML 에는 실려 나가고 개발자 도구를 열면 보인다.
     */
    db.productInquiry.findMany.mockResolvedValue([row()]);

    const page = await getProductInquiries('p-1', other);

    expect(page.items[0]!.content).not.toContain('치수');
    expect(page.items[0]!.answer).toBeNull();
    expect(page.items[0]!.readable).toBe(false);
  });

  it('쓴 사람에게는 그대로 준다', async () => {
    db.productInquiry.findMany.mockResolvedValue([row()]);

    const page = await getProductInquiries('p-1', customer);

    expect(page.items[0]!.content).toBe('치수가 어떻게 되나요');
    expect(page.items[0]!.isMine).toBe(true);
  });

  it('답할 사람에게도 준다', async () => {
    db.productInquiry.findMany.mockResolvedValue([row()]);

    const page = await getProductInquiries('p-1', merchantA);

    expect(page.items[0]!.readable).toBe(true);
    expect(page.items[0]!.canAnswer).toBe(true);
  });

  it('공개 문의는 로그인하지 않아도 그대로 보인다', async () => {
    db.productInquiry.findMany.mockResolvedValue([row({ isPrivate: false })]);

    const page = await getProductInquiries('p-1', null);

    expect(page.items[0]!.content).toBe('치수가 어떻게 되나요');
    expect(page.items[0]!.canAnswer).toBe(false);
  });

  it('작성자 이름은 가린다', async () => {
    db.productInquiry.findMany.mockResolvedValue([row({ isPrivate: false })]);

    const page = await getProductInquiries('p-1', null);

    expect(page.items[0]!.authorName).toBe('홍○동');
  });
});
