import { describe, it, expect } from 'vitest';
import {
  isSafeHref, richTextToPlainText, isRichTextEmpty, asRichTextDoc,
  RICH_TEXT_HEADING_LEVEL, RICH_TEXT_NODE,
  type RichTextDoc,
} from '../src/rich-text';

const p = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
});
const doc = (...content: RichTextDoc['content']): RichTextDoc => ({ type: 'doc', content });

describe('링크 주소 — 여기가 유일하게 남는 구멍이다', () => {
  it('평범한 주소는 받는다', () => {
    expect(isSafeHref('https://plain.example/notice')).toBe(true);
    expect(isSafeHref('http://plain.example')).toBe(true);
    expect(isSafeHref('mailto:help@plain.example')).toBe(true);
    expect(isSafeHref('/support/notice')).toBe(true);
  });

  it('실행되는 주소는 막는다', () => {
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('JaVaScRiPt:alert(1)')).toBe(false);
    expect(isSafeHref('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeHref('vbscript:msgbox(1)')).toBe(false);
  });

  it('공백과 제어문자로 규칙을 피해 가지 못한다', () => {
    /*
     * 브라우저는 주소 안의 탭·줄바꿈을 무시하고 읽는다. 털지 않으면
     * 탭이 낀 `javascript:` 가 "프로토콜 없는 상대 주소" 로 통과한 뒤
     * 실행된다.
     */
    expect(isSafeHref('java\tscript:alert(1)')).toBe(false);
    expect(isSafeHref('java\nscript:alert(1)')).toBe(false);
    expect(isSafeHref('  javascript:alert(1)')).toBe(false);
    expect(isSafeHref('\u0000javascript:alert(1)')).toBe(false);
  });

  it('프로토콜 없는 바깥 주소도 상대 주소가 아니다', () => {
    // `//evil.example` 은 지금 프로토콜을 그대로 물려받아 바깥으로 나간다
    expect(isSafeHref('//evil.example')).toBe(false);
  });

  it('빈 주소는 링크가 아니다', () => {
    expect(isSafeHref('')).toBe(false);
    expect(isSafeHref('   ')).toBe(false);
  });
});

describe('평문 뽑기 — 목록과 본문이 다른 말을 하지 않게', () => {
  it('문단 사이에 줄바꿈을 넣는다', () => {
    // 안 넣으면 "오늘점검합니다내일" 이 된다
    expect(richTextToPlainText(doc(p('오늘'), p('내일')))).toBe('오늘\n내일');
  });

  it('목록도 한 줄씩 뽑는다', () => {
    const list = {
      type: 'bulletList' as const,
      content: [
        { type: 'listItem' as const, content: [p('첫째')] },
        { type: 'listItem' as const, content: [p('둘째')] },
      ],
    };
    expect(richTextToPlainText(doc(list))).toBe('첫째\n둘째');
  });

  it('서식은 글자에 영향을 주지 않는다', () => {
    const bold = {
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: '중요', marks: [{ type: 'bold' as const }] }],
    };
    expect(richTextToPlainText(doc(bold))).toBe('중요');
  });

  it('빈 문단만 있으면 빈 글이다', () => {
    /*
     * 편집기는 아무것도 안 써도 빈 문단 하나를 내보낸다. 길이만 보면
     * 그것이 "내용 있음" 으로 통과해서 제목만 있는 공지가 게시된다.
     */
    expect(isRichTextEmpty(doc({ type: 'paragraph' }))).toBe(true);
    expect(isRichTextEmpty(doc(p('한 글자')))).toBe(false);
  });
});

describe('저장된 값 읽기', () => {
  it('모양이 맞으면 나무로 받는다', () => {
    expect(asRichTextDoc({ type: 'doc', content: [] })).toEqual({ type: 'doc', content: [] });
  });

  it('모양이 아니면 없는 것으로 친다 — 화면은 평문으로 되돌아간다', () => {
    const notDocs = [null, undefined, '본문', 42, {}, { type: 'doc' }, { type: 'paragraph', content: [] }];
    for (const value of notDocs) {
      expect(asRichTextDoc(value)).toBeNull();
    }
  });
});

describe('어휘', () => {
  it('h1 은 쓸 수 없다 — 화면의 h1 은 글 제목이 쓴다', () => {
    expect(RICH_TEXT_HEADING_LEVEL as readonly number[]).not.toContain(1);
    expect(RICH_TEXT_HEADING_LEVEL[0]).toBe(2);
  });

  it('마크업이 될 만한 것은 어휘에 없다', () => {
    // 나무로 주고받는 뜻이 없어지는 이름들
    for (const forbidden of ['html', 'raw', 'iframe', 'script', 'image']) {
      expect(RICH_TEXT_NODE as readonly string[]).not.toContain(forbidden);
    }
  });
});
