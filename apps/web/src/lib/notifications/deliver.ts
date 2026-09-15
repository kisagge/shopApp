import 'server-only';
import type { MailMessage, MailTemplateKind } from '@shop/core';
import type { Locale } from '@shop/i18n';
import { getMailer } from '@shop/mail';
import { getMailWording, type MailWording } from '~/lib/mail/templates';
import { recordNotification, type NoticeInput } from './record';

/**
 * 손님에게 알리기 — 메일 한 통과 알림함 한 줄.
 *
 * 교환 발송·취소·환불·문의 답변이 같은 순서를 따로 적고 있었다: 운영이 고친 문구를 읽고, 메일을 만들어 보내고, 실패하면
 * 적어 두고, 알림함에 남긴다. 한 곳이 순서를 바꾸면(알림을 메일 실패에 묶는 식) 다른 곳과 갈린다.
 *
 * **던지지 않는다.** 부르는 자리에서 본 일(발송·환불·답변)은 이미 끝났다. 메일이 실패해도 알림함에는 남긴다 — 메일은
 * 스팸함으로 가기도 해서, 다시 들어온 사람이 볼 자리가 있어야 한다. 알림 남기기는 스스로 실패를 삼킨다(record).
 */
export async function deliverNotice(input: {
  /** 보낼 메일. 문구는 받는 사람의 말로 읽어 build 에 넘긴다. null 이면 메일 없이 알림만 */
  readonly mail: {
    readonly template: MailTemplateKind;
    readonly locale: Locale;
    readonly build: (wording: MailWording) => MailMessage;
  } | null;
  /** 남길 알림. null 이면 메일만 */
  readonly notification: NoticeInput | null;
  /** 실패를 적을 때의 꼬리표 — 어느 알림의 무엇이 실패했는지 로그에서 찾는다 */
  readonly tag: string;
  readonly ref: string;
}): Promise<void> {
  if (input.mail) {
    try {
      const wording = await getMailWording(input.mail.template, input.mail.locale);
      await getMailer().send(input.mail.build(wording));
    } catch (error) {
      console.error(`[${input.tag}] 메일 발송 실패`, input.ref, error);
    }
  }
  if (input.notification) await recordNotification(input.notification);
}
