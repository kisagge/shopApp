// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import type { RichTextDoc } from '@shop/core';
import { RichText } from '~/components/rich-text';

const doc = (...content: RichTextDoc['content']): RichTextDoc => ({ type: 'doc', content });
const p = (text: string) => ({
  type: 'paragraph' as const,
  content: [{ type: 'text' as const, text }],
});

describe('서식 있는 글을 그린다', () => {
  it('문단·제목·목록을 시맨틱 태그로 만든다', () => {
    const { container } = render(
      <RichText
        doc={doc(
          { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '점검' }] },
          p('안내'),
          {
            type: 'bulletList',
            content: [{ type: 'listItem', content: [p('새벽 2시')] }],
          },
        )}
      />,
    );

    expect(screen.getByRole('heading', { level: 2, name: '점검' })).toBeInTheDocument();
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('listitem')).toHaveTextContent('새벽 2시');
    expect(container.querySelector('p')).toHaveTextContent('안내');
  });

  it('제목 단계는 2~4 로 잡아 둔다 — 화면의 h1 은 글 제목이 쓴다', () => {
    /*
     * 계약이 h1 을 막지만, 옛 행이나 손으로 넣은 행이 있을 수 있다.
     * 한 화면에 h1 이 둘이면 낭독기로 훑을 때 어디가 이 글의 제목인지 모른다.
     */
    render(
      <RichText doc={doc({ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: '가짜' }] })} />,
    );
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '가짜' })).toBeInTheDocument();
  });
});

describe('남이 쓴 글이 실행되지 않는다', () => {
  it('마크업처럼 생긴 글자는 글자로 보인다', () => {
    /*
     * 나무로 주고받는 뜻이 여기 있다. 저장된 것이 HTML 문자열이 아니므로
     * React 가 그대로 이스케이프한다 — `<script>` 라고 적으면 그 글자가 보인다.
     */
    const { container } = render(<RichText doc={doc(p('<script>alert(1)</script>'))} />);
    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
  });

  it('실행되는 주소는 링크가 되지 않고 글자만 남는다', () => {
    const linked = doc({
      type: 'paragraph' as const,
      content: [
        {
          type: 'text' as const,
          text: '눌러 보세요',
          marks: [{ type: 'link' as const, attrs: { href: 'javascript:alert(1)' } }],
        },
      ],
    });
    render(<RichText doc={linked} />);

    // 계약이 이미 막지만, 우회해 들어온 행 하나가 곧바로 실행되는 링크가 되면 안 된다
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('눌러 보세요')).toBeInTheDocument();
  });

  it('평범한 링크는 링크가 되고, 바깥으로 나갈 때 referrer 를 안 흘린다', () => {
    const linked = doc({
      type: 'paragraph' as const,
      content: [
        {
          type: 'text' as const,
          text: '공지',
          marks: [{ type: 'link' as const, attrs: { href: 'https://plain.example' } }],
        },
      ],
    });
    render(<RichText doc={linked} />);

    const link = screen.getByRole('link', { name: '공지' });
    expect(link).toHaveAttribute('href', 'https://plain.example');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noreferrer'));
  });
});

describe('모르는 것을 만나도 화면이 무너지지 않는다', () => {
  it('모르는 노드는 껍데기만 버리고 글자를 남긴다', () => {
    const weird = doc({
      // 계약을 지나온 값이 아니다 — 손으로 넣은 행이 있을 수 있다
      type: 'blinkingMarquee',
      content: [{ type: 'text', text: '살아남는 글자' }],
    } as unknown as RichTextDoc['content'][number]);

    render(<RichText doc={weird} />);
    expect(screen.getByText('살아남는 글자')).toBeInTheDocument();
  });
});
