// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
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

describe('글자에 거는 것', () => {
  /* 모르는 꾸밈도 세울 수 있어야 한다 — 계약을 지나오지 않은 행이 있을 수 있다 */
  const marked = (text: string, ...marks: { type: string; attrs?: Record<string, unknown> }[]): RichTextDoc =>
    doc({
      type: 'paragraph',
      content: [{ type: 'text', text, marks } as unknown as RichTextDoc['content'][number]],
    });

  it.each([
    ['bold', 'strong'],
    ['italic', 'em'],
    ['strike', 's'],
    ['code', 'code'],
  ])('%s 는 <%s> 로 그린다 — 뜻이 있는 태그라야 낭독기에도 들린다', (mark, tag) => {
    const { container } = render(<RichText doc={marked('강조', { type: mark })} />);

    expect(container.querySelector(tag)?.textContent).toBe('강조');
  });

  it('여러 개를 걸면 적힌 순서대로 안쪽부터 감싼다 — 어느 것도 떨어지지 않는다', () => {
    const { container } = render(<RichText doc={marked('둘 다', { type: 'bold' }, { type: 'italic' })} />);

    expect(container.querySelector('em > strong')?.textContent).toBe('둘 다');
  });

  it('링크에 꾸밈을 함께 걸어도 링크로 남는다', () => {
    render(
      <RichText
        doc={marked('공지', { type: 'bold' }, { type: 'link', attrs: { href: '/notice' } })}
      />,
    );

    expect(screen.getByRole('link', { name: '공지' }).querySelector('strong')).not.toBeNull();
  });

  it('모르는 꾸밈이 주소를 들고 있어도 링크가 되지 않는다', () => {
    /*
     * 링크가 되는 것은 **link 꾸밈일 때만**이다. 어휘가 늘어 주소를 지닌 다른
     * 꾸밈이 생겼을 때 그것까지 `<a>` 로 새면, 링크로 쓸 뜻이 없던 자리가
     * 눌리는 자리가 된다.
     */
    render(<RichText doc={marked('반짝', { type: 'sparkle', attrs: { href: 'https://plain.example' } })} />);

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('반짝')).toBeInTheDocument();
  });

  it('모르는 꾸밈은 지나간다 — 글자를 데리고 사라지지 않는다', () => {
    /*
     * 편집기가 쓰는 어휘가 늘면 옛 글에 없던 꾸밈이 들어온다. 모르는 것을 만나
     * 글자까지 버리면, 읽을 수 있던 문장이 통째로 빈다.
     */
    render(<RichText doc={marked('살아남는 글자', { type: 'sparkle' })} />);

    expect(screen.getByText('살아남는 글자')).toBeInTheDocument();
  });
});

describe('링크가 어디로 여는가', () => {
  const link = (href: string) =>
    doc({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: '가기', marks: [{ type: 'link' as const, attrs: { href } }] }],
    });

  it('같은 사이트 안은 이 창에서 연다 — 새 창으로 띄우면 뒤로 가기를 잃는다', () => {
    render(<RichText doc={link('/support/notice/1')} />);

    const anchor = screen.getByRole('link', { name: '가기' });
    expect(anchor).not.toHaveAttribute('target');
    expect(anchor).not.toHaveAttribute('rel');
  });

  it('메일 주소도 새 창을 열지 않는다 — 메일 앱이 받는다', () => {
    render(<RichText doc={link('mailto:help@plain.example')} />);

    expect(screen.getByRole('link', { name: '가기' })).not.toHaveAttribute('target');
  });

  it('바깥으로 나갈 때만 새 창이고, 그때 opener 를 끊는다', () => {
    /*
     * `noopener` 가 없으면 새 창이 `window.opener` 로 이 창의 주소를 바꿀 수 있다
     * — 공지에 링크 하나를 넣어 손님을 가짜 로그인 화면으로 보낼 수 있다는 뜻이다.
     */
    render(<RichText doc={link('https://plain.example')} />);

    const anchor = screen.getByRole('link', { name: '가기' });
    expect(anchor).toHaveAttribute('target', '_blank');
    expect(anchor.getAttribute('rel')).toContain('noopener');
  });

  it('주소가 아예 없는 링크 꾸밈은 글자만 남긴다', () => {
    render(
      <RichText
        doc={doc({
          type: 'paragraph' as const,
          content: [{ type: 'text' as const, text: '빈 링크', marks: [{ type: 'link' as const, attrs: {} }] }],
        })}
      />,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('빈 링크')).toBeInTheDocument();
  });
});

describe('덩이마다의 모양', () => {
  it('줄바꿈은 <br> 로 그린다 — 문단을 쪼개지 않는다', () => {
    const { container } = render(
      <RichText
        doc={doc({
          type: 'paragraph',
          content: [{ type: 'text', text: '앞' }, { type: 'hardBreak' }, { type: 'text', text: '뒤' }],
        })}
      />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
    expect(container.querySelector('p > br')).not.toBeNull();
  });

  it('인용은 <blockquote> 다 — 남의 말이라는 사실이 태그에 남는다', () => {
    const { container } = render(
      <RichText doc={doc({ type: 'blockquote', content: [p('약관 제3조')] })} />,
    );

    expect(container.querySelector('blockquote')?.textContent).toBe('약관 제3조');
  });

  it('가로줄은 구분선으로 읽힌다', () => {
    render(<RichText doc={doc({ type: 'horizontalRule' })} />);

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('번호 목록은 <ol> 이고, 시작 번호를 적었으면 그 번호부터 센다', () => {
    /*
     * **본문이 그 번호를 가리킨다.** "제5조" 로 이어지는 목록이 1부터 다시 세면
     * 앞뒤 글과 어긋나고, 읽는 사람은 어느 쪽이 맞는지 알 수 없다.
     */
    const { container } = render(
      <RichText
        doc={doc({ type: 'orderedList', attrs: { start: 5 }, content: [{ type: 'listItem', content: [p('다섯째')] }] })}
      />,
    );

    expect(container.querySelector('ol')).toHaveAttribute('start', '5');
  });

  it('시작 번호가 없으면 그 칸을 만들지 않는다 — 1 부터가 기본이다', () => {
    const { container } = render(
      <RichText doc={doc({ type: 'orderedList', content: [{ type: 'listItem', content: [p('첫째')] }] })} />,
    );

    expect(container.querySelector('ol')).not.toHaveAttribute('start');
  });

  it('목록 안에 목록을 넣을 수 있다', () => {
    const { container } = render(
      <RichText
        doc={doc({
          type: 'bulletList',
          content: [{
            type: 'listItem',
            content: [p('바깥'), { type: 'bulletList', content: [{ type: 'listItem', content: [p('안쪽')] }] }],
          }],
        })}
      />,
    );

    expect(container.querySelector('ul li ul li')?.textContent).toBe('안쪽');
  });

  it('빈 문단도 자리를 차지한다 — 편집기가 줄을 띄우려고 넣은 것이다', () => {
    /*
     * 빈 `<p>` 는 높이가 0 이라 그냥 사라진다. 쓴 사람은 한 줄을 띄웠는데 읽는
     * 사람에게는 붙어 보인다 — 문단을 나눈 뜻이 없어진다.
     */
    const { container } = render(<RichText doc={doc({ type: 'paragraph' }, p('다음 문단'))} />);

    const first = container.querySelectorAll('p')[0]!;
    expect(first.textContent).toBe('');
    expect(first.className).toContain('min-h');
  });

  it('글이 비어 있어도 그릴 수 있다', () => {
    const { container } = render(<RichText doc={{ type: 'doc', content: [] }} />);

    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('덧붙인 class 를 함께 싣는다 — 부르는 화면이 폭과 색을 정한다', () => {
    const { container } = render(<RichText doc={doc(p('글'))} className="max-w-prose" />);

    expect(container.firstElementChild?.className).toContain('max-w-prose');
  });
});

describe('소독기가 필요 없는 까닭', () => {
  it('이 파일은 HTML 을 직접 꽂지 않는다', () => {
    /*
     * **이 그물이 이 조각의 전제다.** 저장된 것이 HTML 문자열이 아니라 나무라서
     * 소독기가 필요 없는데, 누군가 한 줄만 `dangerouslySetInnerHTML` 로 바꾸면
     * 그 전제가 조용히 무너진다 — 그때는 소독기 없는 길이 된다.
     */
    /* 주석에는 그 이름이 적혀 있다 — 쓰지 않겠다고 밝힌 자리라, 코드만 본다 */
    const code = readFileSync('src/components/rich-text.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((line) => !line.trimStart().startsWith('//'))
      .join('\n');

    expect(code).not.toContain('innerHTML');
    expect(code, '그 이름을 적어 둔 주석까지 지워지지 않았다').toContain('switch (node.type)');
  });
});
