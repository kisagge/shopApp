'use client';

import { useEditor, EditorContent, type Content, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import { useId, useState } from 'react';
import { isSafeHref, RICH_TEXT_HEADING_LEVEL, type RichTextDoc } from '@shop/core';

/**
 * 공지·FAQ 본문 편집기 (TipTap · MIT).
 *
 * **머리 없는(headless) 편집기를 고른 이유.** 다른 후보들은 저마다 스타일시트를
 * 들고 와서 이 저장소의 토큰과 부딪힌다. TipTap 은 모양을 하나도 들고 오지
 * 않아서 우리 디자인으로 그리면 된다.
 *
 * **HTML 이 아니라 나무를 내보낸다.** `getJSON()` 이 주는 것은 core 가 정한
 * 어휘의 나무이고, 그것을 그대로 보낸다. HTML 문자열을 주고받으면 공개 화면이
 * 남이 쓴 마크업을 실행하는 셈이 되는데, 나무로 주고받으면 그 일이 일어날
 * 자리가 없다.
 *
 * **어휘를 여기서 새로 정하지 않는다.** 허용 목록은 core 에 있고, 편집기가
 * 그보다 넓은 것을 만들 수 있으면 계약에서 튕긴다 — 사람은 멀쩡히 써 놓고
 * 저장할 때 거절당한다. 그 어긋남은 rich-editor 검사가 지킨다.
 */

/**
 * StarterKit 에서 **빼는 것들**.
 *
 * - `codeBlock` — 공지에 코드 덩어리가 들어갈 일이 없다. 한 줄 코드는 남긴다.
 * - `underline` — 웹에서 밑줄은 "누를 수 있다" 는 뜻이다. 강조하려고 그은
 *   밑줄이 링크로 읽히면, 정작 링크를 눌러야 할 때 아무도 안 누른다.
 * - `link` — StarterKit 의 것 대신 아래에서 직접 켠다. 받아 줄 프로토콜을
 *   core 가 정하기 때문이다.
 */
export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [...RICH_TEXT_HEADING_LEVEL] },
    codeBlock: false,
    underline: false,
    link: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    // core 가 받아 주는 것과 같은 목록. 여기만 넓히면 저장할 때 튕긴다.
    protocols: ['http', 'https', 'mailto'],
    HTMLAttributes: { rel: 'noreferrer noopener' },
  }),
];

function ToolbarButton({
  editor, label, active, onClick,
}: {
  editor: Editor;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      // 눌린 상태를 색으로만 알리면 낭독기 사용자는 지금 굵기가 켜졌는지 모른다
      aria-pressed={active}
      onClick={() => {
        onClick();
        editor.commands.focus();
      }}
      className={[
        'h-8 rounded-sm border px-2 text-[12px]',
        active
          ? 'border-n-900 bg-n-900 text-n-0'
          : 'border-n-300 bg-[var(--bg)] text-[var(--fg-secondary)]',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

export function RichEditor({
  value,
  onChange,
  labelledBy,
}: {
  value: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  labelledBy: string;
}) {
  const linkId = useId();
  const [linkHref, setLinkHref] = useState('');
  const [linkOpen, setLinkOpen] = useState(false);

  const editor = useEditor({
    extensions: editorExtensions,
    /*
     * core 의 나무는 readonly 로 적어 뒀다 — 화면이 문서를 제자리에서 고치는
     * 일을 막으려는 것이다. 편집기는 자기 것으로 복사해 쓰므로 여기서 벗긴다.
     */
    content: value as Content,
    /*
     * **서버에서 그리지 않는다.** 편집기는 DOM 을 직접 만지므로 서버에서 한 번
     * 그리면 하이드레이션이 어긋난다고 경고한다. 어차피 운영진만 쓰는 화면이라
     * 처음 칠에 없어도 잃는 것이 없다.
     */
    immediatelyRender: false,
    editorProps: {
      attributes: {
        /*
         * **`contenteditable` 만으로는 칸이 아니다.** 접근성 트리에 이름도
         * 역할도 없는 `generic` 으로 떠서, 낭독기로 폼을 훑으면 제목 다음이
         * 곧바로 고정 체크박스다 — 본문 칸이 아예 없는 것처럼 들린다.
         * 역할을 직접 준다.
         */
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-labelledby': labelledBy,
        class:
          'min-h-52 rounded-b-sm border border-t-0 border-n-300 bg-[var(--bg)] p-2.5 ' +
          'text-[13px] leading-relaxed outline-none ' +
          // 편집 중에도 결과와 비슷하게 보여야 한다 — 목록이 점 없이 보이면 목록인지 모른다
          '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ' +
          '[&_h2]:text-[17px] [&_h2]:font-semibold [&_h3]:text-[15px] [&_h3]:font-semibold ' +
          '[&_h4]:text-[14px] [&_h4]:font-semibold ' +
          '[&_blockquote]:border-l-2 [&_blockquote]:border-[var(--border)] [&_blockquote]:pl-3 ' +
          '[&_a]:underline [&_p]:min-h-[1lh]',
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.getJSON() as RichTextDoc),
  });

  if (!editor) {
    // 불러오는 동안에도 자리는 잡아 둔다 — 안 그러면 폼이 덜컥 뛴다
    return <div className="min-h-60 rounded-sm border border-n-300 bg-[var(--surface)]" />;
  }

  const applyLink = () => {
    const href = linkHref.trim();
    if (href.length === 0) {
      editor.chain().focus().unsetLink().run();
    } else if (isSafeHref(href)) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    }
    setLinkHref('');
    setLinkOpen(false);
  };

  return (
    <div>
      <div
        role="toolbar"
        aria-label="글자 서식"
        aria-controls={labelledBy}
        className="flex flex-wrap gap-1 rounded-t-sm border border-n-300 bg-[var(--surface)] p-1.5"
      >
        <ToolbarButton editor={editor} label="굵게" active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} label="기울임" active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton editor={editor} label="취소선" active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton editor={editor} label="코드" active={editor.isActive('code')}
          onClick={() => editor.chain().focus().toggleCode().run()} />

        {RICH_TEXT_HEADING_LEVEL.map((level) => (
          <ToolbarButton
            key={level}
            editor={editor}
            label={`제목${level - 1}`}
            active={editor.isActive('heading', { level })}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          />
        ))}

        <ToolbarButton editor={editor} label="글머리" active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} label="번호" active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} label="인용" active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton editor={editor} label="구분선" active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolbarButton
          editor={editor}
          label="링크"
          active={editor.isActive('link')}
          onClick={() => {
            setLinkHref(editor.isActive('link') ? (editor.getAttributes('link')['href'] ?? '') : '');
            setLinkOpen((open) => !open);
          }}
        />
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2 border-x border-n-300 bg-[var(--surface)] px-1.5 pb-1.5">
          <label htmlFor={linkId} className="text-[12px] text-[var(--fg-muted)]">
            주소
          </label>
          <input
            id={linkId}
            value={linkHref}
            onChange={(e) => setLinkHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              // 폼 안이라 Enter 가 저장까지 눌러 버린다
              e.preventDefault();
              applyLink();
            }}
            placeholder="https://… · 비우면 링크를 뗀다"
            className="h-8 flex-1 rounded-sm border border-n-300 bg-[var(--bg)] px-2 text-[12px]"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-8 rounded-sm border border-n-300 px-2.5 text-[12px]"
          >
            적용
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
