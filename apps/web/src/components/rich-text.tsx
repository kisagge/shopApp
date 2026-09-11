import { Fragment, type ReactNode } from 'react';
import { isSafeHref, type RichTextDoc, type RichTextNode } from '@shop/core';

/**
 * 서식 있는 글을 그린다.
 *
 * **`dangerouslySetInnerHTML` 이 없다.** 저장된 것이 HTML 문자열이 아니라
 * core 가 정한 어휘로 이뤄진 나무이기 때문이다. 여기서 하는 일은 노드 이름을
 * 보고 React 원소를 고르는 것뿐이고, 글자는 React 가 알아서 이스케이프한다 —
 * 공지에 `<script>` 라고 적으면 화면에 `<script>` 라는 **글자**가 보인다.
 *
 * 그래서 소독기가 필요 없다. 소독은 "무엇이 들어 있을지 모르는 문자열" 을
 * 다룰 때 필요한 일이고, 여기서는 애초에 그런 문자열이 들어오지 않는다.
 *
 * **모르는 이름은 그린다고 치지 않는다.** 계약이 이미 걸러 내지만, 옛 글이나
 * 손으로 넣은 행이 있을 수 있다. 모르는 것은 글자만 남기고 지나간다 —
 * 화면이 통째로 무너지는 것보다 낫다.
 */

/** 글자에 거는 것. 안쪽부터 감싼다. */
function withMarks(node: RichTextNode, children: ReactNode): ReactNode {
  let out = children;
  for (const mark of node.marks ?? []) {
    if (mark.type === 'bold') out = <strong>{out}</strong>;
    else if (mark.type === 'italic') out = <em>{out}</em>;
    else if (mark.type === 'strike') out = <s>{out}</s>;
    else if (mark.type === 'code') {
      out = <code className="rounded-xs bg-[var(--surface-2)] px-1 py-0.5 text-[0.9em]">{out}</code>;
    } else if (mark.type === 'link') {
      const href = mark.attrs?.href;
      /*
       * **여기서 한 번 더 본다.** 계약이 이미 막았지만, 이 검사가 없으면
       * "언젠가 계약을 우회해 들어온 행" 하나가 곧바로 실행되는 링크가 된다.
       * 주소를 못 믿으면 링크를 걸지 않고 글자만 남긴다 — 읽는 데는 지장이 없다.
       */
      if (typeof href === 'string' && isSafeHref(href)) {
        const external = /^https?:/i.test(href);
        out = (
          <a
            href={href}
            className="underline underline-offset-2"
            {...(external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          >
            {out}
          </a>
        );
      }
    }
  }
  return out;
}

function renderNodes(nodes: readonly RichTextNode[]): ReactNode {
  return nodes.map((node, index) => <Fragment key={index}>{renderNode(node)}</Fragment>);
}

function renderNode(node: RichTextNode): ReactNode {
  const children = node.content ? renderNodes(node.content) : null;

  switch (node.type) {
    case 'text':
      return withMarks(node, node.text ?? '');

    case 'hardBreak':
      return <br />;

    case 'paragraph':
      // 빈 문단은 편집기가 줄을 띄우려고 넣은 것이다. 높이를 줘야 띄워진다.
      return <p className="min-h-[1lh] whitespace-pre-wrap">{children}</p>;

    case 'heading': {
      /*
       * **h1 은 만들지 않는다.** 화면의 h1 은 글 제목이 쓰고 있다. 단계를
       * core 가 2~4 로 묶어 둔 이유가 그것이고, 혹시 다른 값이 들어와도
       * 여기서 그 범위로 잡아 둔다.
       */
      const level = Math.min(4, Math.max(2, node.attrs?.level ?? 2));
      const Tag = `h${level}` as 'h2' | 'h3' | 'h4';
      const size = level === 2 ? 'text-[17px]' : level === 3 ? 'text-[15px]' : 'text-[14px]';
      return <Tag className={`${size} font-semibold text-[var(--fg)]`}>{children}</Tag>;
    }

    case 'bulletList':
      return <ul className="list-disc pl-5">{children}</ul>;

    case 'orderedList':
      return (
        <ol className="list-decimal pl-5" {...(node.attrs?.start ? { start: node.attrs.start } : {})}>
          {children}
        </ol>
      );

    case 'listItem':
      return <li>{children}</li>;

    case 'blockquote':
      return (
        <blockquote className="border-l-2 border-[var(--border)] pl-4 text-[var(--fg-muted)]">
          {children}
        </blockquote>
      );

    case 'horizontalRule':
      return <hr className="border-[var(--border)]" />;

    default:
      // 모르는 이름 — 껍데기는 버리고 안에 든 글자만 살린다
      return children;
  }
}

export function RichText({ doc, className }: { doc: RichTextDoc; className?: string }) {
  /*
   * 줄 사이는 gap 으로 벌린다. 문단마다 margin 을 주면 첫 줄과 마지막 줄에도
   * 붙어서 위아래 여백이 두 번 생긴다.
   */
  return (
    <div className={`flex flex-col gap-4 text-[15px] leading-loose text-[var(--fg-secondary)] ${className ?? ''}`}>
      {renderNodes(doc.content)}
    </div>
  );
}
