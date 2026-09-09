import { describe, it, expect } from 'vitest';
import { reportReviewSchema } from '../src/review';

describe('리뷰 신고', () => {
  it('사유가 잘못되면 사전 열쇠로 말한다', () => {
    /*
     * 계약은 **문장이 아니라 열쇠**를 담는다. 번역은 응답을 만드는 서버가
     * 요청의 언어로 한다. 예전에는 여기에 한국어가 박혀 있었는데, 그러면
     * 영어·일본어로 보는 운영자에게도 한국어가 나간다.
     */
    const result = reportReviewSchema.safeParse({ reason: 'WHATEVER' });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]!.message).toBe('valid.reportReasonRequired');
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
