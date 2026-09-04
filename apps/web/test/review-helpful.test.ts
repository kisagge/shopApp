import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => {
  const tx = {
    reviewHelpful: {
      createMany: vi.fn<(...a: any[]) => any>(),
      deleteMany: vi.fn<(...a: any[]) => any>(),
    },
    review: {
      update: vi.fn<(...a: any[]) => any>(),
      updateMany: vi.fn<(...a: any[]) => any>(),
      findUniqueOrThrow: vi.fn<(...a: any[]) => any>(),
    },
  };
  return {
    tx,
    review: { findFirst: vi.fn<(...a: any[]) => any>() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock('@shop/db', () => ({ prisma: db }));

const { markHelpful, unmarkHelpful, HelpfulError } = await import('~/lib/reviews/helpful');

const ME = 'u-me';
const REVIEW = 'r-1';

beforeEach(() => {
  vi.clearAllMocks();
  db.review.findFirst.mockResolvedValue({ id: REVIEW, userId: 'u-author' });
  db.tx.reviewHelpful.createMany.mockResolvedValue({ count: 1 });
  db.tx.reviewHelpful.deleteMany.mockResolvedValue({ count: 1 });
  db.tx.review.update.mockResolvedValue({ helpfulCount: 1 });
  db.tx.review.updateMany.mockResolvedValue({ count: 1 });
  db.tx.review.findUniqueOrThrow.mockResolvedValue({ helpfulCount: 0 });
});

describe('누를 수 있는 사람', () => {
  it('내가 쓴 리뷰에는 누를 수 없다', async () => {
    /*
     * 막지 않으면 도움순이 "스스로 누른 횟수" 순이 되어, 정렬을 만든 뜻이
     * 없어진다.
     */
    db.review.findFirst.mockResolvedValue({ id: REVIEW, userId: ME });

    await expect(markHelpful(REVIEW, ME)).rejects.toThrow(HelpfulError);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('없는 리뷰에는 누를 수 없다', async () => {
    db.review.findFirst.mockResolvedValue(null);
    await expect(markHelpful(REVIEW, ME)).rejects.toThrow(HelpfulError);
  });

  it('지운 리뷰는 없는 것과 같다', async () => {
    await markHelpful(REVIEW, ME);
    expect(db.review.findFirst.mock.calls[0]![0].where.deletedAt).toBeNull();
  });
});

describe('켜기는 몇 번을 보내도 같다', () => {
  it('처음 누르면 센 값이 하나 올라간다', async () => {
    db.tx.review.update.mockResolvedValue({ helpfulCount: 3 });

    expect(await markHelpful(REVIEW, ME)).toBe(3);
    expect(db.tx.review.update.mock.calls[0]![0].data).toEqual({
      helpfulCount: { increment: 1 },
    });
  });

  it('이미 눌렀으면 세지 않는다 — 재시도로 표가 늘면 안 된다', async () => {
    db.tx.reviewHelpful.createMany.mockResolvedValue({ count: 0 });
    db.tx.review.findUniqueOrThrow.mockResolvedValue({ helpfulCount: 3 });

    expect(await markHelpful(REVIEW, ME)).toBe(3);
    expect(db.tx.review.update).not.toHaveBeenCalled();
  });

  it('중복은 DB 가 막는다 — 먼저 읽고 나서 넣지 않는다', async () => {
    /*
     * 읽고 나서 넣으면 그 사이에 같은 요청이 하나 더 들어와 둘 다 "없다" 로
     * 읽고 둘 다 센 값을 올린다.
     */
    await markHelpful(REVIEW, ME);
    expect(db.tx.reviewHelpful.createMany.mock.calls[0]![0].skipDuplicates).toBe(true);
  });

  it('표와 센 값이 한 트랜잭션 안에서 함께 바뀐다', async () => {
    // 따로 두면 한쪽만 성공했을 때 화면의 숫자와 실제 표가 갈라진다
    await markHelpful(REVIEW, ME);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('끄기도 몇 번을 보내도 같다', () => {
  it('누른 것을 끄면 센 값이 하나 내려간다', async () => {
    db.tx.review.findUniqueOrThrow.mockResolvedValue({ helpfulCount: 2 });

    expect(await unmarkHelpful(REVIEW, ME)).toBe(2);
    expect(db.tx.review.updateMany.mock.calls[0]![0].data).toEqual({
      helpfulCount: { decrement: 1 },
    });
  });

  it('0 보다 클 때만 내린다 — 음수가 되면 정렬이 뒤집힌다', async () => {
    await unmarkHelpful(REVIEW, ME);
    expect(db.tx.review.updateMany.mock.calls[0]![0].where.helpfulCount).toEqual({ gt: 0 });
  });

  it('누르지 않았던 것을 꺼도 아무 일이 없다', async () => {
    db.tx.reviewHelpful.deleteMany.mockResolvedValue({ count: 0 });
    db.tx.review.findUniqueOrThrow.mockResolvedValue({ helpfulCount: 5 });

    expect(await unmarkHelpful(REVIEW, ME)).toBe(5);
    expect(db.tx.review.updateMany).not.toHaveBeenCalled();
  });
});
