/**
 * 메일 문안.
 *
 * **여기에는 보내는 코드가 없다.** 무엇을 쓸지만 정하고, 실제 발송은
 * @shop/mail 이 맡는다 — 정책은 core, 실행은 바깥이라는 이 저장소의 결을
 * 그대로 따른다. 덕분에 문안은 네트워크 없이 그냥 테스트할 수 있다.
 */

export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  /** 본문. HTML 을 못 읽는 클라이언트가 아직 있고, 스팸 판정에도 유리하다. */
  readonly text: string;
  readonly html: string;
}

/**
 * HTML 에 넣기 전에 반드시 거친다.
 *
 * 상품명과 옵션명은 **가맹점이 적는 값**이다. 그대로 끼워 넣으면 메일 본문이
 * 남이 쓴 마크업을 실행하는 자리가 된다. 받는 사람의 메일함에서 벌어지는
 * 일이라 우리 화면의 XSS 보다 손쓸 방법이 적다.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 공통 껍데기.
 *
 * 바깥에서 아무것도 불러오지 않는다 — 메일 클라이언트는 대부분 외부 CSS 와
 * 웹폰트를 막고, 이미지도 기본으로 차단한다. 인라인 스타일과 시스템 글꼴만 쓴다.
 *
 * **바닥글 문구를 받는다.** 예전에는 한국어가 박혀 있었는데, 주문 안내처럼
 * 받는 사람의 말로 나가야 하는 메일이 생기면서 그 자리만 한국어로 남았다.
 * 여기가 정하는 것은 모양이고, 무슨 말인지는 부르는 쪽이 안다.
 */
export function mailShell(input: {
  readonly heading: string;
  readonly bodyHtml: string;
  readonly footer: string;
}): string {
  return [
    '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Apple SD Gothic Neo\',sans-serif;',
    'font-size:15px;line-height:1.7;color:#2b2926;max-width:520px;margin:0 auto;padding:32px 24px">',
    '<p style="font-size:18px;letter-spacing:0.16em;font-weight:600;margin:0 0 28px">PLAIN</p>',
    `<h1 style="font-size:19px;font-weight:600;margin:0 0 16px">${escapeHtml(input.heading)}</h1>`,
    input.bodyHtml,
    '<p style="color:#6f6a63;font-size:12px;margin:32px 0 0;border-top:1px solid #e6e3de;padding-top:16px">',
    escapeHtml(input.footer),
    '</p></div>',
  ].join('');
}

/** 지금까지의 메일은 전부 한국어다. 받는 사람의 말을 알 길이 없어서다. */
const KO_FOOTER = '포트폴리오 목적으로 제작된 화면입니다. 이 메일은 발신 전용입니다.';

const shell = (heading: string, bodyHtml: string): string =>
  mailShell({ heading, bodyHtml, footer: KO_FOOTER });

export function mailButton(url: string, label: string): string {
  return button(url, label);
}

function button(url: string, label: string): string {
  // href 는 우리가 만든 절대 URL 이라 escapeHtml 만으로 충분하다
  return [
    `<p style="margin:24px 0"><a href="${escapeHtml(url)}" `,
    'style="display:inline-block;background:#2b2926;color:#fdfcfa;text-decoration:none;',
    `padding:12px 22px;border-radius:4px;font-weight:500">${escapeHtml(label)}</a></p>`,
  ].join('');
}

export interface RestockMailInput {
  readonly to: string;
  readonly productName: string;
  readonly optionLabel: string;
  readonly url: string;
}

export function restockMail(input: RestockMailInput): MailMessage {
  const item = `${input.productName} (${input.optionLabel})`;
  return {
    to: input.to,
    // 제목에 상품명을 넣는다 — 여러 개를 신청해 뒀다면 어느 것인지가 먼저다
    subject: `[PLAIN] ${item} 재입고`,
    text: [
      `기다리시던 ${item} 이 다시 입고되었습니다.`,
      '',
      input.url,
      '',
      '재고는 금방 소진될 수 있습니다.',
    ].join('\n'),
    html: shell(
      '재입고되었습니다',
      [
        `<p style="margin:0">기다리시던 <b>${escapeHtml(item)}</b> 이 다시 입고되었습니다.</p>`,
        button(input.url, '상품 보러 가기'),
        '<p style="color:#6f6a63;font-size:13px;margin:0">재고는 금방 소진될 수 있습니다.</p>',
      ].join(''),
    ),
  };
}

export interface LinkMailInput {
  readonly to: string;
  readonly name: string;
  readonly url: string;
}

export function verifyEmailMail(input: LinkMailInput): MailMessage {
  return {
    to: input.to,
    subject: '[PLAIN] 이메일 주소를 확인해 주세요',
    text: [
      `${input.name} 님, 아래 주소로 이메일 확인을 완료해 주세요.`,
      '',
      input.url,
      '',
      '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.',
    ].join('\n'),
    html: shell(
      '이메일 주소를 확인해 주세요',
      [
        `<p style="margin:0">${escapeHtml(input.name)} 님, 아래 버튼으로 확인을 완료해 주세요.</p>`,
        button(input.url, '이메일 확인하기'),
        '<p style="color:#6f6a63;font-size:13px;margin:0">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다.</p>',
      ].join(''),
    ),
  };
}

export function resetPasswordMail(input: LinkMailInput): MailMessage {
  return {
    to: input.to,
    subject: '[PLAIN] 비밀번호 재설정',
    text: [
      `${input.name} 님, 아래 주소에서 비밀번호를 새로 정할 수 있습니다.`,
      '',
      input.url,
      '',
      // 요청하지 않은 사람에게 "무시하세요" 만 말하면 불안하다. 아무 일도
      // 일어나지 않았다는 사실을 함께 알려 준다.
      '본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 비밀번호는 그대로입니다.',
    ].join('\n'),
    html: shell(
      '비밀번호 재설정',
      [
        `<p style="margin:0">${escapeHtml(input.name)} 님, 아래 버튼에서 비밀번호를 새로 정할 수 있습니다.</p>`,
        button(input.url, '비밀번호 재설정'),
        '<p style="color:#6f6a63;font-size:13px;margin:0">본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 비밀번호는 그대로입니다.</p>',
      ].join(''),
    ),
  };
}

export interface InquiryAnswerMailInput {
  readonly to: string;
  /**
   * 어떤 상품에 대한 물음이었는가. **없을 수 있다** — 배송이나 환불처럼
   * 상품과 무관한 문의는 고객센터로 들어온다.
   */
  readonly productName?: string | undefined;
  readonly question: string;
  readonly answer: string;
  readonly url: string;
}

/**
 * 문의에 답이 달렸을 때.
 *
 * **물어본 내용을 함께 싣는다.** 여러 상품에 물어 두었다면 어느 것에 대한
 * 답인지가 먼저고, 답만 오면 무슨 말인지 알 수 없다.
 *
 * 너무 길면 자른다 — 메일 미리보기에 본문이 통째로 밀려 들어가면 제목
 * 옆이 지저분해진다.
 */
export function inquiryAnswerMail(input: InquiryAnswerMailInput): MailMessage {
  const clip = (value: string, max: number) =>
    value.length > max ? `${value.slice(0, max)}…` : value;
  const question = clip(input.question, 200);
  const answer = clip(input.answer, 400);
  // 상품 없는 문의도 온다. 이름 자리를 비워 두면 "undefined 문의" 가 나간다.
  const about = input.productName ?? '고객센터';

  return {
    to: input.to,
    subject: `[PLAIN] ${about} 문의에 답변이 등록되었습니다`,
    text: [
      `${about} 에 남기신 문의에 답변이 등록되었습니다.`,
      '',
      `문의: ${question}`,
      `답변: ${answer}`,
      '',
      input.url,
    ].join('\n'),
    html: shell(
      '문의에 답변이 등록되었습니다',
      [
        `<p style="margin:0"><b>${escapeHtml(about)}</b> 에 남기신 문의에 답변이 등록되었습니다.</p>`,
        `<p style="color:#6f6a63;font-size:13px;margin:16px 0 0">문의</p>`,
        `<p style="margin:4px 0 0">${escapeHtml(question)}</p>`,
        `<p style="color:#6f6a63;font-size:13px;margin:16px 0 0">답변</p>`,
        `<p style="margin:4px 0 0">${escapeHtml(answer)}</p>`,
        button(input.url, input.productName ? '상품에서 보기' : '문의 내역 보기'),
      ].join(''),
    ),
  };
}
