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
