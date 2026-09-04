import { describe, it, expect } from 'vitest';
import { escapeHtml, restockMail, verifyEmailMail, resetPasswordMail } from '../src/mail';

describe('HTML 이스케이프', () => {
  it('마크업으로 읽힐 글자를 모두 막는다', () => {
    expect(escapeHtml('<script>a&b"c\'d')).toBe('&lt;script&gt;a&amp;b&quot;c&#39;d');
  });

  it('& 를 먼저 바꾼다 — 나중에 바꾸면 이미 만든 엔티티를 또 망친다', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('재입고 메일', () => {
  const input = {
    to: 'a@plain.test',
    productName: '오버사이즈 울 블렌드 코트',
    optionLabel: '차콜 / M',
    url: 'https://shop.example/product/coat',
  };

  it('제목에 무엇이 입고됐는지가 들어간다', () => {
    // 여러 개를 신청해 뒀다면 어느 것인지가 먼저 보여야 한다
    const m = restockMail(input);
    expect(m.subject).toContain('오버사이즈 울 블렌드 코트');
    expect(m.subject).toContain('차콜 / M');
  });

  it('본문 두 벌을 모두 만든다 — HTML 을 못 읽는 곳이 아직 있다', () => {
    const m = restockMail(input);
    expect(m.text).toContain(input.url);
    expect(m.html).toContain(input.url);
    expect(m.text).not.toContain('<');
  });

  it('상품명은 가맹점이 적는 값이라 그대로 넣지 않는다', () => {
    const m = restockMail({ ...input, productName: '<img src=x onerror=alert(1)>' });

    expect(m.html).not.toContain('<img');
    expect(m.html).toContain('&lt;img');
  });

  it('링크는 바깥에서 받은 절대 주소를 그대로 쓴다', () => {
    const m = restockMail(input);
    expect(m.html).toContain(`href="${input.url}"`);
  });
});

describe('확인·재설정 메일', () => {
  const input = { to: 'a@plain.test', name: '데모', url: 'https://shop.example/verify?t=x' };

  it('이름도 이스케이프한다 — 사용자가 직접 적는 값이다', () => {
    const m = verifyEmailMail({ ...input, name: '<b>관리자</b>' });
    expect(m.html).not.toContain('<b>관리자');
    expect(m.html).toContain('&lt;b&gt;');
  });

  it('재설정 메일은 아무 일도 없었다는 사실을 함께 알린다', () => {
    // "무시하세요" 만 있으면 요청하지 않은 사람은 계정이 털렸는지 알 수 없다
    const m = resetPasswordMail(input);
    expect(m.text).toContain('비밀번호는 그대로입니다');
    expect(m.html).toContain('비밀번호는 그대로입니다');
  });

  it('두 메일의 제목이 서로 다르다', () => {
    expect(verifyEmailMail(input).subject).not.toBe(resetPasswordMail(input).subject);
  });
});
