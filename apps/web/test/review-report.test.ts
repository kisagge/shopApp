import { describe, it, expect, vi, beforeEach } from 'vitest';

const db = vi.hoisted(() => ({
  review: { findFirst: vi.fn<(...a: any[]) => any>() },
  reviewReport: {
    create: vi.fn<(...a: any[]) => any>(),
    updateMany: vi.fn<(...a: any[]) => any>(),
  },
}));
vi.mock('@shop/db', () => ({ prisma: db }));

const { reportReview, dismissReports, closeReportsAsRemoved, ReviewReportError } =
  await import('~/lib/reviews/report');

const REPORTER = 'u-reporter';
const AUTHOR = 'u-author';
const input = { reason: 'SPAM' as const, detail: null };

beforeEach(() => {
  vi.clearAllMocks();
  db.review.findFirst.mockResolvedValue({ id: 'r-1', userId: AUTHOR });
  db.reviewReport.create.mockResolvedValue({ id: 'rr-1' });
  db.reviewReport.updateMany.mockResolvedValue({ count: 2 });
});

describe('신고', () => {
  it('사유와 신고자를 함께 남긴다', async () => {
    await reportReview(REPORTER, 'r-1', { reason: 'ABUSE', detail: '욕설' });

    expect(db.reviewReport.create).toHaveBeenCalledWith({
      data: { reviewId: 'r-1', reporterId: REPORTER, reason: 'ABUSE', detail: '욕설' },
    });
  });

  it('내 글은 신고할 수 없다', async () => {
    /*
     * 막지 않으면 지우고 싶은 글을 스스로 신고해 대기줄에 올릴 수 있다.
     * 본인 삭제는 확인 한 번이면 되는 별도의 문이 있다.
     */
    await expect(reportReview(AUTHOR, 'r-1', input)).rejects.toMatchObject({
      code: 'CANNOT_REPORT_OWN',
      status: 403,
    });
    expect(db.reviewReport.create).not.toHaveBeenCalled();
  });

  it('이미 사라진 글은 신고할 수 없다', async () => {
    db.review.findFirst.mockResolvedValue(null);

    await expect(reportReview(REPORTER, 'r-1', input)).rejects.toMatchObject({
      code: 'REPORT_TARGET_GONE',
      status: 404,
    });
  });

  it('내려간 글도 신고 대상이 아니다 — 조회가 deletedAt 을 본다', async () => {
    await reportReview(REPORTER, 'r-1', input);

    expect(db.review.findFirst.mock.calls[0]![0].where).toMatchObject({ deletedAt: null });
  });

  it('같은 사람이 두 번 신고하면 DB 제약이 막는다', async () => {
    /*
     * 여기 검사만으로는 동시에 두 번 눌린 경우를 못 막는다. 유니크 제약이
     * 던지는 P2002 를 사용자가 읽을 수 있는 말로 바꿔 준다.
     */
    db.reviewReport.create.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }));

    await expect(reportReview(REPORTER, 'r-1', input)).rejects.toMatchObject({
      code: 'ALREADY_REPORTED',
      status: 409,
    });
  });

  it('그 밖의 DB 오류는 삼키지 않는다', async () => {
    db.reviewReport.create.mockRejectedValue(new Error('연결 끊김'));

    await expect(reportReview(REPORTER, 'r-1', input)).rejects.toThrow('연결 끊김');
  });
});

describe('문제없음으로 닫기', () => {
  it('대기 중인 것만 닫고 누가 닫았는지 남긴다', async () => {
    await dismissReports('u-admin', 'r-1');

    const call = db.reviewReport.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ reviewId: 'r-1', resolvedAt: null });
    expect(call.data).toMatchObject({ resolvedById: 'u-admin', resolution: 'kept' });
  });

  it('닫을 것이 없으면 알린다', async () => {
    // 다른 운영자가 먼저 처리한 경우다. 조용히 성공하면 두 번 처리한 줄 모른다.
    db.reviewReport.updateMany.mockResolvedValue({ count: 0 });

    await expect(dismissReports('u-admin', 'r-1')).rejects.toBeInstanceOf(ReviewReportError);
  });
});

describe('글을 내렸을 때', () => {
  it('남은 신고를 removed 로 닫는다', async () => {
    await closeReportsAsRemoved('u-admin', 'r-1');

    expect(db.reviewReport.updateMany.mock.calls[0]![0].data).toMatchObject({
      resolution: 'removed',
    });
  });

  it('실패해도 던지지 않는다 — 글이 내려간 것이 먼저다', async () => {
    // 대기줄에 한 줄 남는 것뿐이다. 그것 때문에 삭제를 되돌릴 이유가 없다.
    db.reviewReport.updateMany.mockRejectedValue(new Error('연결 끊김'));

    await expect(closeReportsAsRemoved('u-admin', 'r-1')).resolves.toBeUndefined();
  });
});
