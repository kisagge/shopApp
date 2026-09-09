import { describe, it, expect } from 'vitest';
import { LOCALES } from '@shop/i18n';
import { createTranslator } from '@shop/i18n/all';
import { restockMail, inquiryAnswerMail } from '~/lib/mail/notices';
import { localeOf } from '~/lib/mail/recipient';

/**
 * 메일이 받는 사람의 말로 나간다.
 *
 * 오랫동안 넷이 한국어였다. 이유는 "받는 사람이 요청한 사람이 아니라서 무슨
 * 말로 보낼지 알 길이 없다" 였다 — 운영자가 문의에 답을 쓸 때 그 운영자의
 * 말은 받는 사람과 상관없다. 이제 계정이 그 말을 들고 있다.
 *
 * **여기서 지킬 것은 하나다: 답변을 쓴 사람의 말이 아니라 물어본 사람의 말.**
 */

const restock = (locale: (typeof LOCALES)[number]) =>
  restockMail({
    to: 'reader@plain.test',
    productName: '오트 코트',
    optionLabel: '오트 / M',
    url: 'https://plain.test/product/oat-coat',
    locale,
  });

describe('재입고 메일', () => {
  it.each(LOCALES)('%s 로 보내면 그 말로 온다', (locale) => {
    const t = createTranslator(locale);
    const mail = restock(locale);
    expect(mail.subject).toBe(t('mail.restock.subject', { item: '오트 코트 (오트 / M)' }));
    expect(mail.html).toContain(t('mail.restock.heading'));
  });

  it('세 말의 제목이 서로 다르다', () => {
    // 사전에 열쇠만 넣고 번역을 안 채우면 셋이 같아진다. 그러면 위 검사는
    // 통과하면서 실제로는 한국어가 나간다.
    const subjects = new Set(LOCALES.map((l) => restock(l).subject));
    expect(subjects.size).toBe(LOCALES.length);
  });

  it('상품명은 가맹점이 적는 값이라 그대로 넣지 않는다', () => {
    const mail = restockMail({
      to: 'reader@plain.test',
      productName: '<script>bad()</script>',
      optionLabel: 'M',
      url: 'https://plain.test/product/x',
      locale: 'en',
    });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).toContain('&lt;script&gt;');
  });

  it('본문 두 벌을 모두 만든다 — HTML 을 못 읽는 곳이 아직 있다', () => {
    const mail = restock('ja');
    expect(mail.text.length).toBeGreaterThan(0);
    expect(mail.text).not.toContain('<');
    expect(mail.html).toContain('<');
  });
});

describe('문의 답변 메일', () => {
  const answered = (locale: (typeof LOCALES)[number], productName?: string) =>
    inquiryAnswerMail({
      to: 'asker@plain.test',
      ...(productName === undefined ? {} : { productName }),
      question: '세탁은 어떻게 하나요?',
      answer: '드라이클리닝을 권합니다.',
      url: 'https://plain.test/mypage/inquiries',
      locale,
    });

  it.each(LOCALES)('%s 로 보내면 그 말로 온다', (locale) => {
    const t = createTranslator(locale);
    expect(answered(locale, '오트 코트').subject).toBe(
      t('mail.inquiry.subject', { about: '오트 코트' }),
    );
  });

  it('상품 없는 문의도 이름 자리가 비지 않는다', () => {
    // 비워 두면 "undefined 문의" 가 나간다. 그리고 그 대체 이름도 말을 따른다.
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      expect(answered(locale).subject).toContain(t('mail.inquiry.support'));
    }
  });

  it('물어본 내용과 답을 함께 싣는다', () => {
    const mail = answered('ko', '오트 코트');
    expect(mail.text).toContain('세탁은 어떻게 하나요?');
    expect(mail.text).toContain('드라이클리닝을 권합니다.');
  });
});

describe('받는 사람의 말 고르기', () => {
  it('고른 적이 있으면 그것으로 간다', () => {
    expect(localeOf('ja')).toBe('ja');
  });

  it('고른 적이 없으면 기본 말이다', () => {
    // null 은 "아직 안 골랐다" 이지 "한국어를 골랐다" 가 아니다.
    // 다만 못 고른 채 아무것도 안 보내는 것보다는 한 말로라도 가는 편이 낫다.
    expect(localeOf(null)).toBe('ko');
    expect(localeOf(undefined)).toBe('ko');
  });

  it('DB 에 남은 모르는 값은 믿지 않는다', () => {
    // 지원 목록은 나중에 바뀔 수 있다. 지웠던 말이 남은 행을 그대로 넘기면
    // 번역이 안 된 열쇠가 그대로 찍힌 메일이 나간다.
    expect(localeOf('de')).toBe('ko');
    expect(localeOf('')).toBe('ko');
  });
});
