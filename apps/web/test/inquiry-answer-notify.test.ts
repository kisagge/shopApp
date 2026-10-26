import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * 문의에 답했다고 알리는 길.
 *
 * **없으면 물어본 사람이 답이 왔는지 알 방법이 없다.** 그래서 메일과 알림함을 함께 쓰는데, 이 조각이 고르는 셋은
 * 전부 조용히 틀릴 수 있다.
 *
 * - **누구의 말로 보내는가.** 답을 쓴 운영자의 말을 쓰면 일본 손님에게 한국어 메일이 간다. 운영자는 한국어로
 *   답했으니 보낸 쪽에서는 아무 이상이 없어 보인다.
 * - **어디로 보내는가.** 상품 없는 문의(배송·환불 같은 것)는 상품 화면으로 보낼 데가 없다. 그대로 두면
 *   `/product/null` 로 보낸다.
 * - **메일만 보내고 끝나지 않는가.** 메일은 스팸함으로 가기도 한다 — 다시 들어온 사람이 볼 자리가 있어야 한다.
 *
 * 기존 검사들(`notifications`·`notification-templates`)은 **문구만** 본다. 고르는 자리는 아무도 안 봤다.
 */

const deliverNotice = vi.hoisted(() => vi.fn<(...a: any[]) => any>());
vi.mock('~/lib/notifications/deliver', () => ({ deliverNotice }));

const { notifyInquiryAnswered } = await import('~/lib/inquiry/notify');
type AnsweredInquiry = import('~/lib/inquiry/write').AnsweredInquiry;

/** 답변이 저장된 뒤의 문의 — 비는 칸은 검사마다 null 로 덮어 쓴다 */
const INQUIRY: AnsweredInquiry = {
  id: 'iq-1',
  authorId: 'u-asker',
  productName: '울 코트',
  productSlug: 'wool-coat',
  authorEmail: 'asker@plain.test',
  authorName: '김손님',
  authorLocale: 'ko',
  question: '기장이 어떻게 되나요?',
  answer: '총장 110cm 입니다.',
};

const inquiry = (over: Partial<AnsweredInquiry> = {}): AnsweredInquiry => ({ ...INQUIRY, ...over });

const sent = () => deliverNotice.mock.calls[0]?.[0];
/**
 * 메일 만드는 닫힘을 **실제 문구 함수로 돌려 본다.**
 *
 * 흉내 내서 "불렸다" 만 보면 넘긴 값이 틀려도 지나간다 — 주소·받는 사람·말이 다 거기서 정해진다.
 * 빈 표는 "운영이 고친 문구가 없다" 는 뜻이라 기본 문구로 떨어진다.
 */
const mail = () => sent().mail.build({});

beforeEach(() => vi.clearAllMocks());

describe('누구의 말로 보내는가', () => {
  it('물어본 사람이 고른 말로 보낸다 — 답을 쓴 운영자의 말이 아니다', async () => {
    await notifyInquiryAnswered(inquiry({ authorLocale: 'ja' }));

    expect(sent().mail.locale).toBe('ja');
    expect(mail().subject).toContain('お問い合わせに回答がつきました');
  });

  it('고른 적이 없으면 기본 말로 — 못 고른 채 아무것도 안 보내는 것보다 낫다', async () => {
    await notifyInquiryAnswered(inquiry({ authorLocale: null }));

    expect(sent().mail.locale).toBe('ko');
    expect(mail().subject).toContain('답변이 등록되었습니다');
  });

  it('우리가 모르는 말이어도 기본 말로 떨어진다', async () => {
    await notifyInquiryAnswered(inquiry({ authorLocale: 'fr' }));
    expect(sent().mail.locale).toBe('ko');
  });

  it('고른 문구 표도 그 말로 읽는다', async () => {
    // 운영이 고친 문구는 말마다 따로 있다 — 템플릿 종류와 말을 함께 넘긴다
    await notifyInquiryAnswered(inquiry({ authorLocale: 'en' }));
    expect(sent().mail).toMatchObject({ template: 'INQUIRY_ANSWERED', locale: 'en' });
  });
});

describe('답을 보러 갈 곳', () => {
  it('상품 문의면 그 상품 화면으로', async () => {
    await notifyInquiryAnswered(inquiry());

    expect(sent().notification.linkPath).toBe('/product/wool-coat');
    expect(mail().text).toContain('/product/wool-coat');
  });

  it('상품 없는 문의면 내 문의 목록으로 — 보낼 상품 화면이 없다', async () => {
    /*
     * 고객센터 문의(배송·환불 같은 것)에는 상품이 없다. 그대로 상품 화면으로 보내면
     * `/product/null` 이 되고, 답을 보러 간 사람이 없는 화면을 만난다.
     */
    await notifyInquiryAnswered(inquiry({ productSlug: null, productName: null }));

    expect(sent().notification.linkPath).toBe('/mypage/inquiries');
    expect(mail().text).toContain('/mypage/inquiries');
  });

  it('메일에는 눌러서 갈 수 있는 온전한 주소를 넣는다 — 메일에는 우리 사이트가 없다', async () => {
    await notifyInquiryAnswered(inquiry());
    expect(mail().text).toMatch(/https?:\/\/[^\s]+\/product\/wool-coat/);
  });
});

describe('메일과 알림을 함께 남긴다', () => {
  it('둘 다 넘긴다 — 메일은 스팸함으로 가기도 한다', async () => {
    await notifyInquiryAnswered(inquiry());

    expect(sent().mail).not.toBeNull();
    expect(sent().notification).not.toBeNull();
  });

  it('메일은 물어본 사람 주소로 간다', async () => {
    await notifyInquiryAnswered(inquiry());
    expect(mail().to).toBe('asker@plain.test');
  });

  it('알림은 물어본 사람의 알림함에 남는다', async () => {
    await notifyInquiryAnswered(inquiry());
    expect(sent().notification).toMatchObject({
      userId: 'u-asker',
      kind: 'INQUIRY_ANSWERED',
    });
  });

  it('상품 이름이 있으면 문구에 끼울 값으로 싣는다', async () => {
    await notifyInquiryAnswered(inquiry());
    expect(sent().notification.params).toEqual({ productName: '울 코트' });
  });

  it('상품 이름이 없으면 그 칸을 아예 넣지 않는다', async () => {
    /*
     * 비워서 넣으면 알림 문구가 "undefined 문의에 답변이 달렸습니다" 가 된다 —
     * 문구 쪽이 "이름이 없으면" 을 따로 다루고 있으므로 칸을 두지 않는 것이 맞다.
     */
    await notifyInquiryAnswered(inquiry({ productName: null, productSlug: null }));
    expect(sent().notification).not.toHaveProperty('params');
  });
});

describe('실패를 찾을 자리', () => {
  it('어느 알림의 무엇이 실패했는지 꼬리표와 문의 번호를 함께 넘긴다', async () => {
    // 메일은 실패해도 던지지 않는다. 그러면 로그에서 찾는 수밖에 없다
    await notifyInquiryAnswered(inquiry());
    expect(sent()).toMatchObject({ tag: 'inquiry', ref: 'iq-1' });
  });
});
