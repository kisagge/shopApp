import { describe, it, expect } from 'vitest';
import { escapeHtml, mailShell, mailButton } from '../src/mail';

describe('HTML 이스케이프', () => {
  it('마크업으로 읽힐 글자를 모두 막는다', () => {
    expect(escapeHtml('<script>a&b"c\'d')).toBe('&lt;script&gt;a&amp;b&quot;c&#39;d');
  });

  it('& 를 먼저 바꾼다 — 나중에 바꾸면 이미 만든 엔티티를 또 망친다', () => {
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
  });
});

describe('메일 본문 조각', () => {
  it('값을 스스로 이스케이프한다 — 부르는 쪽이 잊어도 가맹점이 적은 이름이 마크업이 되지 않는다', async () => {
    const { mailLead, mailRow, mailSectionLabel, mailList } = await import('../src/mail');
    expect(mailRow('상품', '<b>코트</b>')).toBe('<p style="margin:0 0 6px"><span style="color:#6f6a63">상품</span> &lt;b&gt;코트&lt;/b&gt;</p>');
    expect(mailList(['<i>a</i>', 'b'])).toBe('<ul style="margin:0;padding-left:18px"><li style="margin:0 0 4px">&lt;i&gt;a&lt;/i&gt;</li><li style="margin:0 0 4px">b</li></ul>');
    expect(mailLead('"안녕"')).toContain('&quot;안녕&quot;');
    expect(mailSectionLabel('&')).toContain('&amp;');
  });
});

/**
 * **메일 겉틀.**
 *
 * 바깥에서 아무것도 불러오지 않는다 — 메일 클라이언트는 외부 CSS·웹폰트를 막고 이미지도
 * 기본으로 차단한다. 인라인 스타일과 시스템 글꼴만 쓴다. 그 규칙이 깨지면 **메일이
 * 스타일 없는 맨 글자로 도착하는데, 보낸 쪽에서는 보이지 않는다.**
 *
 * 값은 **여기서** 이스케이프한다. 제목과 바닥글은 부르는 쪽이 주는 글이고(주문 안내는
 * 받는 사람의 말로 나간다), 가맹점이 적은 상품명이 섞여 들어올 수 있다. 본문은 이미
 * 만들어진 마크업이라 그대로 넣는다 — 그 차이가 이 겉틀의 계약이다.
 */
describe('메일 겉틀', () => {
  const shell = () => mailShell({
    heading: '<주문> 완료 & 안내',
    bodyHtml: '<p>이미 만든 마크업</p>',
    footer: '보낸 사람: PLAIN <noreply@plain.test>',
  });

  it('제목과 바닥글은 이스케이프한다', () => {
    const html = shell();
    expect(html).toContain(escapeHtml('<주문> 완료 & 안내'));
    expect(html).toContain(escapeHtml('보낸 사람: PLAIN <noreply@plain.test>'));
    // 날것으로 들어가지 않았다
    expect(html).not.toContain('<주문>');
  });

  it('본문 마크업은 그대로 넣는다 — 이미 만들어진 것을 두 번 막으면 글자로 보인다', () => {
    expect(shell()).toContain('<p>이미 만든 마크업</p>');
  });

  it.each([
    ['외부 스타일시트', /<link/i],
    ['스크립트', /<script/i],
    ['불러오는 글꼴·이미지', /url\(/i],
  ])('%s 를 쓰지 않는다', (_label, pattern) => {
    expect(shell()).not.toMatch(pattern);
  });
});

/** 단추도 같은 계약이다 — 주소와 글자 둘 다 이스케이프한다 */
describe('메일 단추', () => {
  it('주소와 글자를 모두 막는다', () => {
    const html = mailButton('https://plain.test/orders?a=1&b=2', '주문 보기 <상세>');
    expect(html).toContain('href="https://plain.test/orders?a=1&amp;b=2"');
    expect(html).toContain(escapeHtml('주문 보기 <상세>'));
    expect(html).not.toContain('<상세>');
  });

  it('누를 수 있는 크기로 그린다 — 메일에서는 손가락으로 누른다', () => {
    expect(mailButton('https://plain.test', '보기')).toMatch(/padding:12px 22px/);
  });
});
