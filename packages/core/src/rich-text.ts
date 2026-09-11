/**
 * 서식 있는 글의 어휘.
 *
 * 공지는 **평문 한 덩어리**였다. 줄바꿈밖에 못 하니 점검 안내처럼 순서와
 * 강조가 필요한 글이 한 문단으로 뭉쳤다.
 *
 * **HTML 문자열로 주고받지 않는다.** 편집기가 만든 HTML 을 그대로 저장해서
 * 공개 화면에 꽂으면, 그 화면을 보는 **모든 손님**이 그 문자열을 실행하는
 * 셈이 된다. 소독기를 붙여도 "무엇을 허용했는지" 가 정규식 뭉치 안에 숨는다.
 *
 * 그래서 **문서를 나무로 주고받는다.** 여기 적힌 이름만 노드가 될 수 있고,
 * 화면은 그 이름을 보고 React 원소를 만든다 — 마크업이 되는 문자열이
 * 어디에도 없다. **허용 목록이 곧 타입**이고, 새 노드를 들이려면 이 파일을
 * 고쳐야 한다.
 *
 * 편집기(TipTap)가 내보내는 모양을 그대로 쓴다. 우리 형식으로 번역하면
 * 양쪽에 변환기가 하나씩 생기고, 그 둘이 어긋나는 날이 온다.
 */

/** 문단·목록처럼 줄을 차지하는 것 */
export const RICH_TEXT_BLOCK = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'listItem',
  'blockquote',
  'horizontalRule',
] as const;

/** 줄 안에 들어가는 것 */
export const RICH_TEXT_INLINE = ['text', 'hardBreak'] as const;

export const RICH_TEXT_NODE = [...RICH_TEXT_BLOCK, ...RICH_TEXT_INLINE] as const;
export type RichTextNodeType = (typeof RICH_TEXT_NODE)[number];

/** 글자에 거는 것 */
export const RICH_TEXT_MARK = ['bold', 'italic', 'strike', 'code', 'link'] as const;
export type RichTextMarkType = (typeof RICH_TEXT_MARK)[number];

/**
 * 쓸 수 있는 제목 단계.
 *
 * **h1 은 없다.** 화면의 h1 은 공지 제목이 이미 쓰고 있다. 본문이 h1 을
 * 낼 수 있으면 한 화면에 h1 이 둘이 되고, 낭독기로 훑을 때 어디가 이 글의
 * 제목인지 알 수 없다. 단계를 건너뛰는 것(h2 다음 h4)도 같은 이유로 막는다.
 */
export const RICH_TEXT_HEADING_LEVEL = [2, 3, 4] as const;
export type RichTextHeadingLevel = (typeof RICH_TEXT_HEADING_LEVEL)[number];

/*
 * **없음과 비어 있음을 둘 다 받는다.** 편집기는 안 쓰는 칸을 아예 빼고
 * 보내지만(`undefined`), JSON 을 거쳐 오면 `null` 로 오는 칸이 생긴다 —
 * TipTap 의 링크가 `target: null` 을 그렇게 보낸다. 한쪽만 받으면 멀쩡한
 * 문서가 계약에서 튕긴다.
 */
export interface RichTextMark {
  readonly type: RichTextMarkType;
  readonly attrs?:
    | {
        readonly href?: string | null | undefined;
        readonly target?: string | null | undefined;
        readonly rel?: string | null | undefined;
        readonly class?: string | null | undefined;
      }
    | null
    | undefined;
}

export interface RichTextNode {
  readonly type: RichTextNodeType;
  readonly text?: string | null | undefined;
  readonly attrs?:
    | {
        readonly level?: number | null | undefined;
        readonly start?: number | null | undefined;
      }
    | null
    | undefined;
  readonly marks?: readonly RichTextMark[] | null | undefined;
  readonly content?: readonly RichTextNode[] | null | undefined;
}

export interface RichTextDoc {
  readonly type: 'doc';
  readonly content: readonly RichTextNode[];
}

/**
 * 나무가 너무 깊거나 커지지 않게 한다.
 *
 * 목록 안의 목록 안의 목록… 은 화면에서 읽히지 않고, 깊이가 없으면 재귀
 * 검증이 서버를 붙잡고 있을 수 있다. 본문 길이 상한은 평문일 때와 같은
 * 값을 쓴다 — 서식이 붙었다고 쓸 수 있는 말이 늘어나는 것은 아니다.
 */
export const RICH_TEXT_MAX_DEPTH = 6;
export const RICH_TEXT_MAX_NODES = 2_000;

/**
 * 링크 주소로 받아 줄 것.
 *
 * **여기가 유일하게 남는 구멍이다.** 나무로 주고받으면 마크업은 못 들어오는데,
 * 링크의 href 만은 끝까지 문자열로 남아 `<a href>` 가 된다. `javascript:` 를
 * 막지 않으면 "누르면 실행되는 공지" 를 쓸 수 있다.
 *
 * 막을 것을 나열하지 않고 **받을 것만 나열한다.** 막을 것을 세면 `JaVaScRiPt:`
 * 나 `java\tscript:` 같은 것을 계속 뒤쫓게 된다.
 */
const ALLOWED_SCHEME = ['http', 'https', 'mailto'] as const;

/**
 * **먼저 공백과 제어문자를 턴다.** 브라우저는 주소 안의 탭·줄바꿈을 무시하고
 * 읽으므로 `java&#9;script:` 가 그대로 실행된다. 털지 않고 규칙만 세우면
 * 규칙이 못 보는 글자로 규칙을 피해 간다.
 */
/*
 * eslint 이 제어문자를 규칙으로 막는다 — 보통은 실수로 들어간 것이기
 * 때문이다. **여기서는 그것이 노리는 대상**이라 예외로 둔다. 털어 내지
 * 않으면 탭이 낀 `javascript:` 가 규칙을 피해 간다.
 */
// eslint-disable-next-line no-control-regex
const bare = (href: string): string => href.replace(/[\u0000-\u0020\u007f]/g, '');

const SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

export function isSafeHref(href: string): boolean {
  const value = bare(href);
  if (value.length === 0) return false;

  const scheme = SCHEME.exec(value)?.[1]?.toLowerCase();
  if (scheme !== undefined) {
    return (ALLOWED_SCHEME as readonly string[]).includes(scheme);
  }

  /*
   * 프로토콜이 없으면 같은 사이트 안이다 — 실행될 수 없다. 다만 `//evil.com`
   * 은 프로토콜 없는 **바깥** 주소라(scheme-relative) 여기 끼면 안 된다.
   */
  return value.startsWith('/') && !value.startsWith('//');
}

/** 이 노드가 담은 글자 */
const textOf = (node: RichTextNode): string =>
  node.type === 'text'
    ? (node.text ?? '')
    : (node.content ?? []).map(textOf).join('');

/**
 * 나무에서 평문을 뽑는다.
 *
 * 목록의 요약, 검색, `<meta name="description">` 은 서식이 필요 없고 오히려
 * 방해가 된다. 그래서 **평문도 함께 저장한다** — 뽑아내는 규칙은 여기
 * 하나뿐이라 목록과 본문이 다른 말을 하지 않는다.
 *
 * 줄을 차지하는 것 사이에는 줄바꿈을 넣는다. 안 넣으면 문단 셋이 한 줄로
 * 이어 붙어 "오늘점검합니다내일" 이 된다.
 */
export function richTextToPlainText(doc: RichTextDoc): string {
  const lines = doc.content.map((node) =>
    node.type === 'bulletList' || node.type === 'orderedList'
      ? (node.content ?? []).map(textOf).join('\n')
      : textOf(node),
  );
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 빈 글인가.
 *
 * 편집기는 아무것도 안 써도 빈 문단 하나를 내보낸다. 길이만 보면 그것이
 * "내용 있음" 으로 통과해서, 제목만 있는 공지가 게시된다.
 */
export function isRichTextEmpty(doc: RichTextDoc): boolean {
  return richTextToPlainText(doc).length === 0;
}

/**
 * 저장된 값을 나무로 받아 준다.
 *
 * DB 의 Json 칸은 무엇이든 담을 수 있다 — 서식 없이 쓰인 옛 글은 비어 있고,
 * 손으로 넣은 행이 있을 수도 있다. **모양이 아니면 없는 것으로 친다.**
 * 그러면 화면은 평문으로 되돌아가 그리고, 읽는 사람은 아무것도 못 느낀다.
 *
 * 안쪽까지 검사하지는 않는다 — 그건 계약이 쓰기에서 할 일이고, 그려 내는
 * 쪽은 모르는 노드를 만나도 글자만 남기고 지나간다.
 */
export function asRichTextDoc(value: unknown): RichTextDoc | null {
  if (typeof value !== 'object' || value === null) return null;
  const doc = value as { type?: unknown; content?: unknown };
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return null;
  return { type: 'doc', content: doc.content as readonly RichTextNode[] };
}
