import { describe, it, expect, vi, beforeEach } from 'vitest';

const tx = vi.hoisted(() => ({
  review: {
    create: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
    delete: vi.fn<(...a: any[]) => any>(),
    aggregate: vi.fn<(...a: any[]) => any>(),
  },
  reviewImage: {
    deleteMany: vi.fn<(...a: any[]) => any>(),
    createMany: vi.fn<(...a: any[]) => any>(),
    update: vi.fn<(...a: any[]) => any>(),
  },
  product: { update: vi.fn<(...a: any[]) => any>() },
}));
const db = vi.hoisted(() => ({
  orderItem: { findUnique: vi.fn<(...a: any[]) => any>() },
  review: {
    findFirst: vi.fn<(...a: any[]) => any>(),
    findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
  },
  $transaction: vi.fn<(...a: any[]) => any>(),
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const discard = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/reviews/images', () => ({ discardReviewImages: discard }));

const { createReview, updateReview, deleteReview, restoreReview } =
  await import('~/lib/reviews/write-review');

const USER = 'u-buyer';
const input = {
  orderItemId: 'oi-1', rating: 5, content: '아주 좋습니다 정말로요',
  sizeFit: 'TRUE' as const, height: 175, weight: 70,
};

const item = (over: Record<string, unknown> = {}) => ({
  id: 'oi-1', status: 'DELIVERED',
  variant: { productId: 'p-1' },
  order: { userId: USER, status: 'DELIVERED' },
  review: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.orderItem.findUnique.mockResolvedValue(item());
  db.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx));
  tx.review.create.mockResolvedValue({ id: 'r-1', rating: 5, productId: 'p-1' });
  tx.review.update.mockResolvedValue({ id: 'r-1', rating: 4, productId: 'p-1' });
  tx.review.aggregate.mockResolvedValue({ _sum: { rating: 9 }, _count: { _all: 2 } });
});

describe('구매 확인', () => {
  it('산 사람은 쓸 수 있다', async () => {
    await expect(createReview(USER, input)).resolves.toMatchObject({ id: 'r-1' });
  });

  it('남의 주문 항목 id 를 알아내도 쓸 수 없다', async () => {
    db.orderItem.findUnique.mockResolvedValue(item({ order: { userId: 'u-other', status: 'DELIVERED' } }));
    await expect(createReview(USER, input)).rejects.toMatchObject({
      code: 'NOT_PURCHASED', status: 403,
    });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('없는 주문 항목이면 404', async () => {
    db.orderItem.findUnique.mockResolvedValue(null);
    await expect(createReview(USER, input)).rejects.toMatchObject({ status: 404 });
  });
});

describe('배송 완료 확인', () => {
  it.each(['PENDING', 'PAID', 'PREPARING', 'SHIPPED'] as const)(
    '%s 상태에서는 쓸 수 없다',
    async (status) => {
      // 받지도 않은 물건의 후기는 상품이 아니라 기대에 대한 것이다
      db.orderItem.findUnique.mockResolvedValue(item({ order: { userId: USER, status } }));
      await expect(createReview(USER, input)).rejects.toMatchObject({ code: 'NOT_DELIVERED' });
    },
  );

  it('구매확정 뒤에도 쓸 수 있다', async () => {
    db.orderItem.findUnique.mockResolvedValue(item({ order: { userId: USER, status: 'CONFIRMED' } }));
    await expect(createReview(USER, input)).resolves.toBeDefined();
  });

  it('주문이 배송완료여도 반품·취소로 돈이 돌아간 줄에는 쓸 수 없다', async () => {
    /*
     * 일부 반품·일부 취소가 생기자 "주문이 배송완료" 가 곧 "이 줄을 샀다" 가 아니게 됐다. 돌려보낸
     * 니트에 후기가 붙으면 산 사람의 후기가 아니다. id 를 알고 직접 보내는 요청도 막는다.
     */
    db.orderItem.findUnique.mockResolvedValue(item({ canceledAt: new Date('2026-09-12') }));
    await expect(createReview(USER, input)).rejects.toMatchObject({ code: 'NOT_PURCHASED' });
  });
});

describe('중복 방지', () => {
  it('같은 주문 항목에 두 번 쓸 수 없다', async () => {
    db.orderItem.findUnique.mockResolvedValue(item({ review: { id: 'r-old' } }));
    await expect(createReview(USER, input)).rejects.toMatchObject({
      code: 'ALREADY_REVIEWED', status: 409,
    });
  });
});

describe('평점 집계', () => {
  it('증감이 아니라 원본을 다시 센다', async () => {
    // 증감은 한 번 어긋나면 스스로 알아채지 못한다.
    // 포인트 잔액에서 이미 겪은 문제다.
    await createReview(USER, input);
    expect(tx.review.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { productId: 'p-1', deletedAt: null } }),
    );
  });

  it('세 값을 함께 갱신한다', async () => {
    await createReview(USER, input);
    // 9 / 2 = 4.5 → 450
    expect(tx.product.update.mock.calls[0]?.[0].data).toEqual({
      ratingSum: 9, reviewCount: 2, ratingScore: 450,
    });
  });

  it('리뷰가 하나도 없으면 전부 0 이 된다', async () => {
    tx.review.aggregate.mockResolvedValue({ _sum: { rating: null }, _count: { _all: 0 } });
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: USER, productId: 'p-1', images: [] });
    await deleteReview({ userId: USER, canModerate: false }, 'r-1');
    expect(tx.product.update.mock.calls[0]?.[0].data).toEqual({
      ratingSum: 0, reviewCount: 0, ratingScore: 0,
    });
  });

  it('삭제된 리뷰는 집계에서 뺀다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: USER, productId: 'p-1', images: [] });
    await deleteReview({ userId: USER, canModerate: false }, 'r-1');
    expect(tx.review.aggregate.mock.calls[0]?.[0].where.deletedAt).toBeNull();
  });

  it('리뷰 쓰기와 같은 트랜잭션에서 돈다', async () => {
    await createReview(USER, input);
    expect(db.$transaction).toHaveBeenCalledOnce();
  });
});

describe('수정', () => {
  const stored = { rating: 5, content: '아주 좋습니다 정말로요', sizeFit: 'TRUE', height: 175, weight: 70 };
  const mine = (over: Record<string, unknown> = {}) => ({
    id: 'r-1', userId: USER, productId: 'p-1', orderItemId: 'oi-1', images: [], ...over,
  });

  beforeEach(() => {
    db.review.findFirst.mockResolvedValue(mine());
    db.review.findUniqueOrThrow.mockResolvedValue(stored);
  });

  it('내 리뷰만 고칠 수 있다', async () => {
    db.review.findFirst.mockResolvedValue(mine({ userId: 'u-other' }));
    await expect(updateReview(USER, 'r-1', { rating: 1 })).rejects.toMatchObject({
      code: 'NOT_OWN_REVIEW', status: 403,
    });
  });

  it('운영진이 내린 글은 없는 것과 같다 — 고쳐서 되살릴 수 없다', async () => {
    db.review.findFirst.mockResolvedValue(null);
    await expect(updateReview(USER, 'r-1', { rating: 1 })).rejects.toMatchObject({
      code: 'REVIEW_NOT_FOUND', status: 404,
    });
  });

  it('보내지 않은 필드는 건드리지 않는다', async () => {
    await updateReview(USER, 'r-1', { rating: 4 });
    expect(Object.keys(tx.review.update.mock.calls[0]?.[0].data)).toEqual(['rating', 'editedAt']);
  });

  it('null 은 지운다는 뜻이라 그대로 보낸다', async () => {
    await updateReview(USER, 'r-1', { sizeFit: null });
    expect(tx.review.update.mock.calls[0]?.[0].data).toMatchObject({ sizeFit: null });
  });

  it('별점을 고치면 집계도 다시 센다', async () => {
    await updateReview(USER, 'r-1', { rating: 4 });
    expect(tx.product.update).toHaveBeenCalled();
  });

  it('달라진 것이 있으면 고친 시각을 남긴다', async () => {
    await updateReview(USER, 'r-1', { content: '생각보다 얇습니다. 안에 하나 더 입어야 합니다.' });
    expect(tx.review.update.mock.calls[0]?.[0].data.editedAt).toBeInstanceOf(Date);
  });

  it('같은 값을 그대로 저장하면 수정됨이 붙지 않는다', async () => {
    /*
     * 저장을 눌렀다는 것만으로 표시가 붙으면, 그 표시를 보고 "내가 읽은 것과 다른 글일 수 있다" 고 판단하는
     * 사람을 헛되게 만든다.
     */
    await updateReview(USER, 'r-1', { rating: stored.rating, content: stored.content });
    expect(tx.review.update.mock.calls[0]?.[0].data.editedAt).toBeUndefined();
  });
});

describe('삭제', () => {
  beforeEach(() => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: USER, productId: 'p-1', images: [] });
  });

  it('본인이 지우면 행을 없앤다 — 다시 쓸 수 있어야 한다', async () => {
    // 흔적을 남기면 주문 항목당 하나라는 유니크 제약 때문에
    // 마음이 바뀌어 다시 쓰려는 사람을 영영 막게 된다
    await deleteReview({ userId: USER, canModerate: false }, 'r-1');
    expect(tx.review.delete).toHaveBeenCalledWith({ where: { id: 'r-1' } });
    expect(tx.review.update).not.toHaveBeenCalled();
  });

  it('운영진이 지우면 표시만 한다 — 같은 구매로 다시 올릴 수 없어야 한다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: 'u-other', productId: 'p-1', images: [] });
    await deleteReview({ userId: 'u-admin', canModerate: true }, 'r-1');
    expect(tx.review.update.mock.calls[0]?.[0].data.deletedAt).toBeInstanceOf(Date);
    expect(tx.review.delete).not.toHaveBeenCalled();
  });

  it('운영진이 자기 리뷰를 지우면 본인 규칙을 따른다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: 'u-admin', productId: 'p-1', images: [] });
    await deleteReview({ userId: 'u-admin', canModerate: true }, 'r-1');
    expect(tx.review.delete).toHaveBeenCalled();
  });

  it('남의 리뷰는 못 지운다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: 'u-other', productId: 'p-1', images: [] });
    await expect(deleteReview({ userId: USER, canModerate: false }, 'r-1'))
      .rejects.toMatchObject({ code: 'NOT_OWN_REVIEW' });
  });

  it('운영진은 남의 리뷰도 지울 수 있다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: 'u-other', productId: 'p-1', images: [] });
    await expect(deleteReview({ userId: 'u-admin', canModerate: true }, 'r-1')).resolves.toBeUndefined();
  });

  it('이미 지운 리뷰는 404', async () => {
    db.review.findFirst.mockResolvedValue(null);
    await expect(deleteReview({ userId: USER, canModerate: false }, 'r-1'))
      .rejects.toMatchObject({ code: 'REVIEW_NOT_FOUND', status: 404 });
  });
});

describe('리뷰 사진', () => {
  it('올린 주소와 키를 함께 저장한다', async () => {
    await createReview(USER, input, [
      { url: 'https://cdn.test/reviews/oi-1/a.png', key: 'reviews/oi-1/a.png', blurDataUrl: 'data:image/webp;base64,AAAA' },
      { url: 'https://cdn.test/reviews/oi-1/b.png', key: 'reviews/oi-1/b.png', blurDataUrl: null },
    ]);

    /*
     * 키를 따로 두지 않으면 나중에 지울 대상을 찾을 방법이 없다. 그리고
     * **순서를 함께 박는다** — 예전에는 주소 배열과 키 배열의 자리 번호가
     * 곧 순서였는데, 표로 옮기면서 그 약속이 사라졌다.
     */
    expect(tx.review.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        images: {
          create: [
            {
              url: 'https://cdn.test/reviews/oi-1/a.png',
              storageKey: 'reviews/oi-1/a.png',
              blurDataUrl: 'data:image/webp;base64,AAAA',
              sortOrder: 0,
            },
            {
              url: 'https://cdn.test/reviews/oi-1/b.png',
              storageKey: 'reviews/oi-1/b.png',
              blurDataUrl: null,
              sortOrder: 1,
            },
          ],
        },
      }),
    }));
  });

  it('사진이 없으면 빈 배열로 남는다', async () => {
    await createReview(USER, input);

    expect(tx.review.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ images: { create: [] } }),
    }));
  });

  it('본인이 지우면 사진도 지운다', async () => {
    db.review.findFirst.mockResolvedValue({
      id: 'r-1', userId: USER, productId: 'p-1',
      images: [{ storageKey: 'k1' }, { storageKey: 'k2' }],
    });

    await deleteReview({ userId: USER, canModerate: false }, 'r-1');

    expect(discard).toHaveBeenCalledWith(['k1', 'k2']);
  });

  it('운영진이 내린 글의 사진은 남긴다 — 반쪽짜리 기록이 되면 안 된다', async () => {
    db.review.findFirst.mockResolvedValue({
      id: 'r-1', userId: 'u-other', productId: 'p-1', images: [{ storageKey: 'k1' }],
    });

    await deleteReview({ userId: 'u-admin', canModerate: true }, 'r-1');

    expect(tx.review.update).toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });
});

describe('내린 글 되돌리기', () => {
  it('deletedAt 을 지우고 집계를 다시 센다', async () => {
    // 내려간 동안 평점 집계에서 빠져 있었다
    db.review.findFirst.mockResolvedValue({ id: 'r-1', productId: 'p-1' });

    await restoreReview('r-1');

    expect(tx.review.update).toHaveBeenCalledWith({
      where: { id: 'r-1' }, data: { deletedAt: null },
    });
    expect(tx.product.update).toHaveBeenCalled();
  });

  it('내려가지 않은 글은 되돌릴 것이 없다', async () => {
    db.review.findFirst.mockResolvedValue(null);

    await expect(restoreReview('r-1')).rejects.toMatchObject({
      code: 'REVIEW_NOT_FOUND', status: 404,
    });
  });

  it('내려간 것만 찾는다', async () => {
    db.review.findFirst.mockResolvedValue({ id: 'r-1', productId: 'p-1' });

    await restoreReview('r-1');

    expect(db.review.findFirst.mock.calls[0]![0].where).toMatchObject({
      deletedAt: { not: null },
    });
  });
});

describe('수정할 때의 사진', () => {
  const photos = [
    { id: 'i-1', storageKey: 'k-1' },
    { id: 'i-2', storageKey: 'k-2' },
  ];

  beforeEach(() => {
    db.review.findFirst.mockResolvedValue({
      id: 'r-1', userId: USER, productId: 'p-1', orderItemId: 'oi-1', images: photos,
    });
    db.review.findUniqueOrThrow.mockResolvedValue({
      rating: 5, content: '아주 좋습니다 정말로요', sizeFit: 'TRUE', height: 175, weight: 70,
    });
  });

  it('사진 얘기가 없으면 손대지 않는다 — 글만 고치는 요청이 사진을 날리면 안 된다', async () => {
    await updateReview(USER, 'r-1', { rating: 4 });
    expect(tx.reviewImage.deleteMany).not.toHaveBeenCalled();
    expect(discard).not.toHaveBeenCalled();
  });

  it('남기지 않은 사진은 기록에서도 저장소에서도 지운다', async () => {
    await updateReview(USER, 'r-1', { keepImageIds: ['i-1'] });
    expect(tx.reviewImage.deleteMany.mock.calls[0]?.[0].where.id.in).toEqual(['i-2']);
    expect(discard).toHaveBeenCalledWith(['k-2']);
  });

  it('빈 목록은 전부 뺀다는 뜻이다', async () => {
    await updateReview(USER, 'r-1', { keepImageIds: [] });
    expect(discard).toHaveBeenCalledWith(['k-1', 'k-2']);
  });

  it('새 사진은 남은 사진 뒤에 붙고, 남은 사진은 번호를 다시 받는다', async () => {
    // 가운데를 빼면 번호에 구멍이 생기는데, 그대로 두면 새 사진이 옛 사진 앞으로 끼어든다
    await updateReview(USER, 'r-1', { keepImageIds: ['i-2'] }, [
      { url: 'https://cdn/new.webp', key: 'k-new', blurDataUrl: null },
    ]);
    expect(tx.reviewImage.update.mock.calls[0]?.[0]).toMatchObject({
      where: { id: 'i-2' }, data: { sortOrder: 0 },
    });
    expect(tx.reviewImage.createMany.mock.calls[0]?.[0].data[0]).toMatchObject({
      storageKey: 'k-new', sortOrder: 1,
    });
  });

  it('한도를 넘으면 아무것도 고치지 않는다', async () => {
    const adding = Array.from({ length: 4 }, (_, i) => ({ url: `u-${i}`, key: `k-${i}`, blurDataUrl: null }));
    await expect(
      updateReview(USER, 'r-1', { keepImageIds: ['i-1', 'i-2'] }, adding),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REVIEW_IMAGES' });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('글자 하나 안 바뀌어도 사진이 바뀌었으면 수정됨이 붙는다', async () => {
    await updateReview(USER, 'r-1', { keepImageIds: ['i-1'] });
    expect(tx.review.update.mock.calls[0]?.[0].data.editedAt).toBeInstanceOf(Date);
  });
});
