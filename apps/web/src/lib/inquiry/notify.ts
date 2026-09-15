import 'server-only';
import { inquiryAnswerMail } from '~/lib/mail/notices';
import { localeOf } from '~/lib/mail/recipient';
import { absoluteUrl } from '~/lib/urls';
import type { AnsweredInquiry } from './write';
import { deliverNotice } from '~/lib/notifications/deliver';

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
  // **답변을 쓴 운영자의 말이 아니라 물어본 사람의 말이다.**
  const locale = localeOf(inquiry.authorLocale);
  /*
   * 상품 없는 문의는 상품 화면으로 보낼 수 없다. 답을 보러 갈 곳이 없으면 알림이 반쪽이므로 내 문의 목록으로 보낸다.
   */
  const path = inquiry.productSlug ? `/product/${inquiry.productSlug}` : '/mypage/inquiries';

  await deliverNotice({
    tag: 'inquiry',
    ref: inquiry.id,
    mail: {
      template: 'INQUIRY_ANSWERED',
      locale,
      build: (wording) => inquiryAnswerMail({
        to: inquiry.authorEmail,
        locale,
        ...(inquiry.productName ? { productName: inquiry.productName } : {}),
        question: inquiry.question,
        answer: inquiry.answer,
        url: absoluteUrl(path),
      }, wording),
    },
    // 메일과 **함께** 남긴다. 메일은 놓치기 쉽고 스팸함으로 가기도 한다 — 다시 들어온 사람이 답이 왔는지 볼 자리가 있어야 한다
    notification: {
      userId: inquiry.authorId,
      kind: 'INQUIRY_ANSWERED',
      ...(inquiry.productName ? { params: { productName: inquiry.productName } } : {}),
      linkPath: path,
    },
  });
}
