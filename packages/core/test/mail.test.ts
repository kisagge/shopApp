import { describe, it, expect } from 'vitest';
import { escapeHtml } from '../src/mail';

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
