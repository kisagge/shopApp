import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { consoleMailer, resendMailer, getMailer, setMailerForTest, MailError } from '../src/index';

const message = {
  to: 'a@plain.test',
  subject: '제목',
  text: '본문',
  html: '<p>본문</p>',
};

beforeEach(() => {
  setMailerForTest(null);
  delete process.env['RESEND_API_KEY'];
  delete process.env['MAIL_FROM'];
});
afterEach(() => vi.unstubAllGlobals());

describe('발송기 고르기', () => {
  it('키가 없으면 콘솔로 간다', () => {
    expect(getMailer().name).toBe('console');
  });

  it('키만 있고 발신 주소가 없으면 보내지 않는다', () => {
    // 발신 주소 없이 보내면 어차피 거절당한다. 반쯤 설정된 상태가 가장 나쁘다.
    process.env['RESEND_API_KEY'] = 'k';
    expect(getMailer().name).toBe('console');
  });

  it('둘 다 있으면 실제로 보낸다', () => {
    process.env['RESEND_API_KEY'] = 'k';
    process.env['MAIL_FROM'] = 'PLAIN <no-reply@plain.test>';
    expect(getMailer().name).toBe('resend');
  });
});

describe('콘솔 발송기', () => {
  it('조용히 성공한 척하지 않고 미발송이라고 남긴다', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await consoleMailer.send(message);

    expect(info).toHaveBeenCalledOnce();
    expect(info.mock.calls[0]?.[0]).toContain('미발송');
    info.mockRestore();
  });
});

describe('Resend 발송기', () => {
  it('본문 두 벌과 발신 주소를 함께 보낸다', async () => {
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await resendMailer('key-1', 'PLAIN <no-reply@plain.test>').send(message);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['authorization']).toBe('Bearer key-1');
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body['from']).toBe('PLAIN <no-reply@plain.test>');
    expect(body['to']).toEqual(['a@plain.test']);
    expect(body['text']).toBe('본문');
    expect(body['html']).toBe('<p>본문</p>');
  });

  it('실패하면 던진다 — 삼키면 부르는 쪽이 판단할 기회를 잃는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 422 })));

    await expect(resendMailer('k', 'f').send(message)).rejects.toBeInstanceOf(MailError);
  });

  it('남의 서비스가 돌려준 문장을 우리 오류에 싣지 않는다', async () => {
    // 이 메시지는 로그에도 화면에도 닿을 수 있다
    vi.stubGlobal('fetch', vi.fn(async () => new Response('You can only send to a@owner.test', { status: 403 })));

    await expect(resendMailer('k', 'f').send(message)).rejects.toThrow(/^메일 발송에 실패했습니다\. \(403\)$/);
  });
});
