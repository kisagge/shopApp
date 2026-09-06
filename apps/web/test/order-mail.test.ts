import { describe, it, expect } from 'vitest';
import { orderMail, orderLocale, shipToLine } from '~/lib/orders/notify';

/**
 * 주문 안내 메일의 문안.
 *
 * **보내는 코드와 따로 본다.** 문안은 네트워크 없이 그냥 만들어 볼 수 있고,
 * 여기서 틀리면 받는 사람의 메일함에서 드러난다 — 우리 화면과 달리 고칠
 * 방법이 없다.
 */

const base = {
  to: 'demo@plain.test',
  buyerName: '데모 고객',
  orderNo: '20260906-1234567',
  locale: 'ko' as const,
  items: [
    { productName: '울 코트', optionLabel: 'M / 블랙', quantity: 2, unitPrice: 144_500 },
  ],
  payable: 289_000,
  shipTo: '데모 · (04524) 서울 중구 세종대로 110',
};

describe('결제 완료 안내', () => {
  it('제목과 본문에 주문번호가 있다 — 메일함에서 어느 주문인지 알아야 한다', () => {
    const mail = orderMail('paid', base);
    expect(mail.subject).toContain(base.orderNo);
    expect(mail.text).toContain(base.orderNo);
    expect(mail.html).toContain(base.orderNo);
  });

  it('금액은 줄 합계로 적는다 — 단가만 적으면 받는 사람이 다시 곱해야 한다', () => {
    const mail = orderMail('paid', base);
    expect(mail.text).toContain('289,000');
  });

  it('HTML 을 못 읽는 클라이언트를 위해 순수 텍스트도 만든다', () => {
    const mail = orderMail('paid', base);
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.text).not.toContain('<');
  });

  /**
   * 상품명과 옵션명은 **가맹점이 적는 값**이다. 그대로 끼워 넣으면 메일
   * 본문이 남이 쓴 마크업을 실행하는 자리가 된다 — 받는 사람의 메일함에서
   * 벌어지는 일이라 우리 화면의 XSS 보다 손쓸 방법이 적다.
   */
  it('상품명에 든 마크업을 그대로 내보내지 않는다', () => {
    const mail = orderMail('paid', {
      ...base,
      items: [{ productName: '<img src=x onerror=alert(1)>', optionLabel: 'M', quantity: 1, unitPrice: 1000 }],
    });
    expect(mail.html).not.toContain('<img src=x');
    expect(mail.html).toContain('&lt;img');
  });
});

describe('가상계좌 입금 안내', () => {
  const account = { bank: '국민', accountNumber: '12345678901234', dueDate: new Date('2026-09-09T14:59:59Z') };

  /**
   * **계좌번호가 메일에 없으면 화면을 닫는 순간 어디로 넣을지 알 수 없다.**
   * 결제 화면은 다시 열리지 않는다.
   */
  it('은행·계좌번호·기한을 담는다', () => {
    const mail = orderMail('pending', { ...base, virtualAccount: account });
    for (const part of ['국민', '12345678901234']) {
      expect(mail.text).toContain(part);
      expect(mail.html).toContain(part);
    }
  });

  it('결제 완료 메일에는 계좌를 넣지 않는다 — 넣을 이유가 없다', () => {
    const mail = orderMail('paid', { ...base, virtualAccount: account });
    expect(mail.text).not.toContain('12345678901234');
  });

  /**
   * **기한은 마감이라 시각이 있어야 한다.** "9월 9일까지" 만 적으면 그날
   * 언제까지인지 알 수 없고, 그 하루 차이로 주문이 자동 취소된다.
   */
  it('기한에는 시각까지 적는다', () => {
    const mail = orderMail('pending', { ...base, virtualAccount: account });
    // UTC 14:59 는 한국 시각으로 오후 11:59 다. 서버가 UTC 로 돌아도
    // 받는 사람이 읽는 것은 한국 시각이어야 한다.
    expect(mail.text).toContain('11:59');
    expect(mail.text).toContain('오후');
  });

  it('기한이 없으면 그 줄을 빼고 만든다', () => {
    const mail = orderMail('pending', {
      ...base,
      virtualAccount: { ...account, dueDate: null },
    });
    expect(mail.text).toContain('12345678901234');
    expect(mail.html).not.toContain('undefined');
  });
});

describe('주문한 그때의 말로 보낸다', () => {
  it.each([
    ['ko', '주문이 완료되었습니다'],
    ['en', 'Your order is confirmed'],
    ['ja', 'ご注文が確定しました'],
  ] as const)('%s', (locale, heading) => {
    const mail = orderMail('paid', { ...base, locale });
    expect(mail.subject).toContain(heading);
    expect(mail.html).toContain(heading);
  });

  it('바닥글도 함께 옮겨간다 — 한 통 안에서 말이 섞이면 안 된다', () => {
    expect(orderMail('paid', { ...base, locale: 'en' }).html).toContain('portfolio project');
    expect(orderMail('paid', { ...base, locale: 'en' }).html).not.toContain('포트폴리오');
  });

  it('금액도 그 말의 표기를 따른다', () => {
    // 통화 표기가 언어마다 다르다. 숫자만 같고 껍데기가 달라야 한다.
    const ko = orderMail('paid', { ...base, locale: 'ko' }).text;
    const en = orderMail('paid', { ...base, locale: 'en' }).text;
    expect(ko).not.toBe(en);
  });
});

describe('주문에 남은 말을 읽는다', () => {
  it.each([['ko'], ['en'], ['ja']])('%s 는 그대로 쓴다', (value) => {
    expect(orderLocale(value)).toBe(value);
  });

  it.each([[null], [undefined], ['fr'], ['']])('모르는 값(%s)은 기본 말로', (value) => {
    expect(orderLocale(value)).toBe('ko');
  });
});

describe('배송지 한 줄', () => {
  it('받는 사람과 주소를 한 줄로 만든다', () => {
    expect(
      shipToLine({ recipient: '데모', postalCode: '04524', address1: '세종대로 110', address2: '3층' }),
    ).toBe('데모 · (04524) 세종대로 110 3층');
  });

  it('상세 주소가 없어도 빈 자리를 남기지 않는다', () => {
    expect(
      shipToLine({ recipient: '데모', postalCode: '04524', address1: '세종대로 110', address2: null }),
    ).toBe('데모 · (04524) 세종대로 110');
  });
});
