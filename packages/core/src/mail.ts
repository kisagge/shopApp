/**
 * 메일 문안.
 *
 * **여기에는 보내는 코드도, 문구도 없다.** 껍데기와 이스케이프만 둔다.
 *
 * 문구가 여기 있었을 때는 전부 한국어였다 — core 는 의존성이 없는 순수 정책
 * 묶음이라 사전을 가져올 수 없기 때문이다. 그래서 무슨 말을 쓸지는 부르는
 * 쪽이 정하게 옮겼다: 주문·재입고·문의는 apps/web, 인증은 packages/auth.
 *
 * 실제 발송은 @shop/mail 이 맡는다 — 정책은 core, 실행은 바깥이라는 이
 * 저장소의 결을 그대로 따른다.
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


/**
 * 본문 조각들 — 주문·교환·취소 메일이 같은 모양을 따로 적고 있어 여기로 모았다. **값은 여기서 이스케이프한다** — 부르는
 * 쪽이 잊어도 가맹점이 적은 상품명이 마크업으로 실행되지 않게.
 */

/** 첫 문장. 아래 줄들과 한 칸 띄운다 */
export function mailLead(text: string): string {
  return `<p style="margin:0 0 20px">${escapeHtml(text)}</p>`;
}

/** 이름 = 값 한 줄. 메일 클라이언트가 표 레이아웃을 잘 다루지 못해 문단으로 쌓는다 */
export function mailRow(label: string, value: string): string {
  return `<p style="margin:0 0 6px"><span style="color:#6f6a63">${escapeHtml(label)}</span> ${escapeHtml(value)}</p>`;
}

/** 목록 위의 작은 제목 */
export function mailSectionLabel(text: string): string {
  return `<p style="margin:20px 0 6px;color:#6f6a63">${escapeHtml(text)}</p>`;
}

/** 줄 목록(상품 줄 등). 줄마다 이스케이프한다 */
export function mailList(lines: readonly string[]): string {
  return `<ul style="margin:0;padding-left:18px">${lines.map((l) => `<li style="margin:0 0 4px">${escapeHtml(l)}</li>`).join('')}</ul>`;
}

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







/**
 * 문의에 답이 달렸을 때.
 *
 * **물어본 내용을 함께 싣는다.** 여러 상품에 물어 두었다면 어느 것에 대한
 * 답인지가 먼저고, 답만 오면 무슨 말인지 알 수 없다.
 *
 * 너무 길면 자른다 — 메일 미리보기에 본문이 통째로 밀려 들어가면 제목
 * 옆이 지저분해진다.
 */
