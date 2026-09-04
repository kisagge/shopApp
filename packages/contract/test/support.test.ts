import { describe, it, expect } from 'vitest';
import { supportPostSchema, createInquirySchema } from '../src';

const post = (over: Record<string, unknown> = {}) => ({
  kind: 'NOTICE', title: '배송 안내', body: '연휴에는 늦어집니다', ...over,
});

describe('고객센터 글', () => {
  it('공지는 갈래 없이 받는다', () => {
    expect(supportPostSchema.safeParse(post()).success).toBe(true);
  });

  it('FAQ 에 갈래가 없으면 거절한다', () => {
    const r = supportPostSchema.safeParse(post({ kind: 'FAQ' }));
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['topic']);
  });

  it('공지에 갈래를 붙이면 거절한다', () => {
    // 화면에서만 막으면 API 를 직접 부르는 쪽으로 들어온다
    expect(supportPostSchema.safeParse(post({ topic: 'DELIVERY' })).success).toBe(false);
  });

  it('FAQ 에 갈래가 있으면 받는다', () => {
    expect(supportPostSchema.safeParse(post({ kind: 'FAQ', topic: 'DELIVERY' })).success).toBe(true);
  });

  it('모르는 갈래는 받지 않는다', () => {
    expect(supportPostSchema.safeParse(post({ kind: 'FAQ', topic: 'SHIPPING' })).success).toBe(false);
  });

  it('기본은 초안이다 — 쓰다 만 공지가 새어 나가면 안 된다', () => {
    const r = supportPostSchema.parse(post());
    expect(r.published).toBe(false);
  });

  it('빈 제목과 빈 본문은 받지 않는다', () => {
    expect(supportPostSchema.safeParse(post({ title: ' ' })).success).toBe(false);
    expect(supportPostSchema.safeParse(post({ body: '' })).success).toBe(false);
  });
});

describe('문의', () => {
  const content = '언제쯤 도착할까요?';

  it('상품 문의는 그대로 받는다', () => {
    const r = createInquirySchema.safeParse({ productId: 'cabcdefghijklmnopqrstuvwx', content });
    expect(r.success).toBe(true);
  });

  it('갈래만 있어도 받는다 — 상품과 무관한 물음이 있다', () => {
    expect(createInquirySchema.safeParse({ topic: 'DELIVERY', content }).success).toBe(true);
  });

  it('상품도 갈래도 없으면 거절한다', () => {
    /*
     * 어디에도 안 붙는 문의는 **누가 답할지 알 수 없다** — 대기줄에서
     * 조용히 늙는다.
     */
    const r = createInquirySchema.safeParse({ content });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['topic']);
  });

  it('너무 짧은 내용은 받지 않는다', () => {
    expect(createInquirySchema.safeParse({ topic: 'ETC', content: '음' }).success).toBe(false);
  });
});
