import 'server-only';
import { inquiryAnswerMail } from '@shop/core';
import { getMailer } from '@shop/mail';
import { absoluteUrl } from '~/lib/urls';
import type { AnsweredInquiry } from './write';

/**
 * 답변이 달렸다고 알린다.
 *
 * **없으면 물어본 사람이 답이 왔는지 알 방법이 없다.** 상품 페이지를 다시
 * 열어 보는 수밖에 없는데, 그러라고 만든 기능이 아니다.
 *
 * 실패해도 던지지 않는다. 부르는 자리에서는 답변이 이미 저장돼 있어
 * 되돌릴 수도 없고, 메일이 안 갔다고 답변을 무를 이유도 없다 —
 * 재입고 알림과 같은 규칙이다.
 */
export async function notifyInquiryAnswered(inquiry: AnsweredInquiry): Promise<void> {
  try {
    await getMailer().send(
      inquiryAnswerMail({
        to: inquiry.authorEmail,
        productName: inquiry.productName,
        question: inquiry.question,
        answer: inquiry.answer,
        url: absoluteUrl(`/product/${inquiry.productSlug}`),
      }),
    );
  } catch (error) {
    console.error('[inquiry] 답변 알림 메일 실패', inquiry.id, error);
  }
}
