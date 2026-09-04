import { describe, it, expect } from 'vitest';
import { reportReviewSchema } from '../src/review';

describe('리뷰 신고', () => {
  it('사유가 잘못되면 한국어로 말한다', () => {
    // Zod 기본 메시지는 영어로 나온다. 사용자에게 그대로 보이면 안 된다.
    const result = reportReviewSchema.safeParse({ reason: 'WHATEVER' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('신고 사유를 골라 주세요');
  });

  it('설명은 없어도 된다', () => {
    const result = reportReviewSchema.safeParse({ reason: 'SPAM' });

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.detail).toBeNull();
  });

  it('설명은 앞뒤 공백을 떼고 저장한다', () => {
    const result = reportReviewSchema.parse({ reason: 'OTHER', detail: '  띄어쓰기  ' });
    expect(result.detail).toBe('띄어쓰기');
  });

  it('설명이 너무 길면 거절한다', () => {
    const result = reportReviewSchema.safeParse({ reason: 'OTHER', detail: 'ㄱ'.repeat(501) });
    expect(result.success).toBe(false);
  });
});
