import { describe, it, expect, vi } from 'vitest';

vi.mock('@shop/db', () => ({ prisma: { user: { findUnique: vi.fn() } } }));

const { verifyEmailMail, resetPasswordMail } = await import('../src/mail');
const { LOCALES, createTranslator } = await import('@shop/i18n');

/**
 * 인증 메일 문안.
 *
 * 오랫동안 한국어였다. 화면은 세 말로 나가는데 **비밀번호를 잊은 사람에게는
 * 한국어만 갔다** — 로그인을 못 하는 상태라 화면에서 말을 바꿀 수도 없다.
 */

const input = (locale: (typeof LOCALES)[number]) => ({
  to: 'reader@plain.test',
  name: '데모 사용자',
  url: 'https://plain.test/reset?token=abc',
  locale,
});

describe('확인 · 재설정 메일', () => {
  it.each(LOCALES)('%s 로 보내면 그 말로 온다', (locale) => {
    const t = createTranslator(locale);
    expect(verifyEmailMail(input(locale)).subject).toBe(t('mail.verify.subject'));
    expect(resetPasswordMail(input(locale)).subject).toBe(t('mail.reset.subject'));
  });

  it('세 말의 제목이 서로 다르다', () => {
    // 열쇠만 넣고 번역을 안 채우면 셋이 같아진다 — 위 검사는 통과하면서
    // 실제로는 한국어가 나간다.
    for (const build of [verifyEmailMail, resetPasswordMail]) {
      expect(new Set(LOCALES.map((l) => build(input(l)).subject)).size).toBe(LOCALES.length);
    }
  });

  it('두 메일의 제목이 서로 다르다', () => {
    for (const locale of LOCALES) {
      expect(verifyEmailMail(input(locale)).subject).not.toBe(
        resetPasswordMail(input(locale)).subject,
      );
    }
  });

  it('재설정 메일은 아무 일도 없었다는 사실을 함께 알린다', () => {
    // 요청하지 않은 사람에게 "무시하세요" 만 말하면 불안하다.
    for (const locale of LOCALES) {
      const t = createTranslator(locale);
      expect(resetPasswordMail(input(locale)).text).toContain(t('mail.reset.ignore'));
    }
  });

  it('이름도 이스케이프한다 — 사용자가 직접 적는 값이다', () => {
    const mail = verifyEmailMail({ ...input('en'), name: '<img src=x onerror=1>' });
    expect(mail.html).not.toContain('<img');
    expect(mail.html).toContain('&lt;img');
  });

  it('본문 두 벌을 모두 만든다', () => {
    const mail = resetPasswordMail(input('ja'));
    expect(mail.text).toContain('https://plain.test/reset?token=abc');
    expect(mail.text).not.toContain('<');
  });
});
