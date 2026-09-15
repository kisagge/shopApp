import { describe, it, expect } from 'vitest';
import { failureMessage } from '~/lib/client/failure-message';

describe('failureMessage', () => {
  it('창구가 준 말을 쓴다', async () => {
    expect(await failureMessage(Response.json({ code: 'X', message: '이미 보관한 상품입니다' }, { status: 409 }), '기본')).toBe('이미 보관한 상품입니다');
  });

  it('본문이 JSON 이 아니거나 비었거나 말이 없으면 기본 문구 — 네트워크 오류로 오해하게 던지지 않는다', async () => {
    expect(await failureMessage(new Response('<html>502</html>', { status: 502 }), '기본')).toBe('기본');
    expect(await failureMessage(new Response(null, { status: 500 }), '기본')).toBe('기본');
    expect(await failureMessage(Response.json({ code: 'X' }, { status: 400 }), '기본')).toBe('기본');
    expect(await failureMessage(Response.json({ message: '  ' }, { status: 400 }), '기본')).toBe('기본');
    expect(await failureMessage(Response.json(['x'], { status: 400 }), '기본')).toBe('기본');
  });
});
