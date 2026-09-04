import type { MailMessage } from '@shop/core';

/**
 * 메일 발송.
 *
 * 문안은 @shop/core 가 만들고 여기서는 보내기만 한다.
 *
 * **SMTP 가 아니라 HTTP API 를 쓴다.** 이 앱은 서버리스에서 도는데, SMTP 는
 * 호출마다 연결을 새로 맺고 인사를 주고받아야 해서 짧은 실행에 잘 맞지 않고
 * 막아 두는 사업자도 있다. 메일 한 통에 POST 한 번이면 되는 쪽이 단순하다.
 * 그래서 의존성도 없다 — fetch 하나뿐이다.
 */

export interface Mailer {
  readonly name: string;
  /**
   * 실패하면 던진다.
   *
   * 삼키지 않는 이유는 부르는 쪽마다 사정이 다르기 때문이다. 비밀번호
   * 재설정 메일이 안 나갔으면 사용자는 오지 않는 메일을 기다리게 되므로
   * 그 자리에서 알려야 하고, 재입고 알림은 실패해도 재고 수정까지 되돌릴
   * 일이 아니다. 어느 쪽인지는 여기가 아니라 부르는 쪽이 안다.
   */
  send(message: MailMessage): Promise<void>;
}

/**
 * 키가 없을 때의 기본값.
 *
 * 조용히 성공한 척하지 않는다. 아무것도 안 하면서 성공을 돌려주면
 * "메일이 왜 안 오지" 를 며칠 뒤에 알게 된다. 무엇이 나갔어야 하는지와
 * 왜 안 나갔는지가 로그에 남아야 한다.
 */
export const consoleMailer: Mailer = {
  name: 'console',
  send(message) {
    console.info(
      `[mail] ${message.to} — "${message.subject}" (미발송 — RESEND_API_KEY 없음)`,
    );
    return Promise.resolve();
  },
};

export class MailError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'MailError';
  }
}

export function resendMailer(apiKey: string, from: string): Mailer {
  return {
    name: 'resend',
    async send(message) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
      });

      if (!res.ok) {
        /**
         * 응답 본문을 그대로 오류 메시지에 싣지 않는다.
         *
         * 이 메시지는 로그로도 가고 경우에 따라 화면에도 닿는다. 남의 서비스가
         * 돌려준 문장을 그대로 옮기면 우리가 통제하지 못하는 글이 우리 이름으로
         * 나가고, 받는 주소 같은 것이 함께 딸려 나올 수도 있다.
         */
        throw new MailError(res.status, `메일 발송에 실패했습니다. (${res.status})`);
      }
    },
  };
}

let override: Mailer | null = null;

/**
 * 환경에 맞는 발송기.
 *
 * 도메인 인증 전에는 Resend 가 **계정 주인에게만** 배달한다. 포트폴리오에서는
 * 그걸로 충분하고, 실제로 열려면 도메인 하나와 DNS 인증이 필요하다.
 */
export function getMailer(): Mailer {
  if (override) return override;

  const key = process.env['RESEND_API_KEY'];
  const from = process.env['MAIL_FROM'];
  if (!key || !from) return consoleMailer;

  return resendMailer(key, from);
}

/** 테스트에서 갈아 끼운다. null 을 주면 환경을 다시 본다. */
export function setMailerForTest(mailer: Mailer | null): void {
  override = mailer;
}
