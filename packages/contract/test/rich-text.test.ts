import { describe, it, expect } from 'vitest';
import { RICH_TEXT_MAX_DEPTH, RICH_TEXT_MAX_NODES } from '@shop/core';
import { richTextSchema } from '../src/rich-text';

const text = (value: string) => ({ type: 'text', text: value });
const paragraph = (value: string) => ({ type: 'paragraph', content: [text(value)] });
const doc = (...content: unknown[]) => ({ type: 'doc', content });

/** 목록 안의 목록 안의 목록… 을 depth 겹으로 쌓는다 */
function nested(depth: number): unknown {
  let node: unknown = paragraph('바닥');
  for (let i = 0; i < depth; i += 1) {
    node = { type: 'bulletList', content: [{ type: 'listItem', content: [node] }] };
  }
  return node;
}

describe('허용 목록이 곧 스키마다', () => {
  it('어휘 안의 글은 통과한다', () => {
    const result = richTextSchema.safeParse(
      doc(
        { type: 'heading', attrs: { level: 2 }, content: [text('점검 안내')] },
        paragraph('아래 시간 동안 주문이 되지 않습니다.'),
        {
          type: 'bulletList',
          content: [{ type: 'listItem', content: [paragraph('9월 20일 새벽 2시부터')] }],
        },
      ),
    );
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  it('어휘에 없는 노드는 막는다', () => {
    // 마크업이 들어올 수 있는 이름은 애초에 이름이 아니다
    for (const type of ['image', 'iframe', 'html', 'script', 'codeBlock']) {
      expect(richTextSchema.safeParse(doc({ type })).success, type).toBe(false);
    }
  });

  it('어휘에 없는 마크도 막는다', () => {
    const marked = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: '밑줄', marks: [{ type: 'underline' }] }],
    });
    expect(richTextSchema.safeParse(marked).success).toBe(false);
  });

  it('h1 은 만들 수 없다 — 화면의 h1 은 글 제목이 쓴다', () => {
    const h1 = doc({ type: 'heading', attrs: { level: 1 }, content: [text('제목')] });
    expect(richTextSchema.safeParse(h1).success).toBe(false);
    const h2 = doc({ type: 'heading', attrs: { level: 2 }, content: [text('제목')] });
    expect(richTextSchema.safeParse(h2).success).toBe(true);
  });
});

describe('링크', () => {
  const linked = (href: string) =>
    doc({
      type: 'paragraph',
      content: [{ type: 'text', text: '여기', marks: [{ type: 'link', attrs: { href } }] }],
    });

  it('실행되는 주소는 저장되지 않는다', () => {
    /*
     * 나무로 주고받으면 마크업은 못 들어오는데, href 만은 끝까지 문자열로
     * 남아 `<a href>` 가 된다. 막지 않으면 "누르면 실행되는 공지" 다.
     */
    expect(richTextSchema.safeParse(linked('javascript:alert(1)')).success).toBe(false);
    expect(richTextSchema.safeParse(linked('https://plain.example')).success).toBe(true);
  });

  it('주소 없는 링크는 링크가 아니다', () => {
    const noHref = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: '여기', marks: [{ type: 'link', attrs: {} }] }],
    });
    expect(richTextSchema.safeParse(noHref).success).toBe(false);
  });

  it('편집기가 함께 보내는 빈 칸(target·rel)은 받아 준다', () => {
    // TipTap 은 안 쓰는 칸을 null 로 보낸다. 한쪽만 받으면 멀쩡한 글이 튕긴다.
    const withNulls = doc({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: '여기',
          marks: [{ type: 'link', attrs: { href: 'https://plain.example', target: null, rel: null } }],
        },
      ],
    });
    expect(richTextSchema.safeParse(withNulls).success).toBe(true);
  });
});

describe('크기 상한 — 없으면 본문 하나가 서버를 붙잡는다', () => {
  it('너무 깊으면 막는다', () => {
    /*
     * 목록 한 겹은 두 층이다 — 목록과 그 안의 항목. 그래서 두 겹이면
     * 목록·항목·목록·항목·문단·글자로 여섯 층이고, 상한이 딱 그만큼이다.
     * 사람이 읽을 수 있는 중첩은 여기까지다.
     */
    expect(RICH_TEXT_MAX_DEPTH).toBe(6);
    expect(richTextSchema.safeParse(doc(nested(2))).success).toBe(true);
    expect(richTextSchema.safeParse(doc(nested(3))).success).toBe(false);
  });

  it('노드가 너무 많으면 막는다', () => {
    const many = Array.from({ length: RICH_TEXT_MAX_NODES }, () => paragraph('줄'));
    expect(richTextSchema.safeParse(doc(...many)).success).toBe(false);
  });

  it('길이는 평문으로 센다 — 굵게 했다고 쓸 수 있는 말이 줄지 않는다', () => {
    const bolded = doc({
      type: 'paragraph',
      content: [{ type: 'text', text: '가'.repeat(5_000), marks: [{ type: 'bold' }] }],
    });
    // 마크가 붙어 JSON 은 훨씬 크지만, 사람이 쓴 말은 5,000 자다
    expect(richTextSchema.safeParse(bolded).success).toBe(true);
  });

  it('그래도 본문 상한은 있다', () => {
    const tooLong = doc(paragraph('가'.repeat(10_001)));
    expect(richTextSchema.safeParse(tooLong).success).toBe(false);
  });
});
