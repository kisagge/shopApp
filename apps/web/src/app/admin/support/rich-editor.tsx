'use client';

import {
  useEditor, useEditorState, EditorContent,
  type Content, type Editor,
} from '@tiptap/react';
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
        /*
         * **손가락에 맞는 크기.** 32px 이었는데 이 저장소가 정한 모바일 터치
         * 타깃은 44px 이다(Button 의 size 주석). 마우스는 32px 을 정확히
         * 찍지만 엄지는 못 찍는다 — 굵게를 누르려다 기울임이 걸린다.
         */
        'h-11 shrink-0 rounded-sm border px-3 text-[13px] sm:h-8 sm:px-2 sm:text-[12px]',
        /*
          **눌린 모양도 테마를 탄다.** `bg-[var(--brand)]` 은 저울의 눈금이라 테마가
          바뀌어도 안 바뀐다 — 어두운 화면에서 켜진 단추가 바탕과 같은 검정이
          되어, 눌렀는지 아닌지가 다시 안 보였다.
        */
        active
          ? 'border-[var(--brand)] bg-[var(--brand)] text-[var(--bg)]'
          : 'border-[var(--border-strong)] bg-[var(--bg)] text-[var(--fg-secondary)]',
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
        /*
         * **16px 아래로 내려가면 iOS 가 화면을 확대한다.** 이 앱은 사람이
         * 손으로 확대할 수 있어야 해서 `maximumScale` 을 걸지 않았고, 그래서
         * 초점이 들어가는 순간 webview 가 제 마음대로 당긴다 — 제목 칸(16px)
         * 에서는 가만히 있다가 본문으로 넘어가면 화면이 툭 커진다.
         * 좁은 화면에서만 16px 로 둔다. 어차피 폰에서는 13px 이 작기도 하다.
         */
        class:
          'min-h-52 rounded-b-sm border border-t-0 border-[var(--border-strong)] bg-[var(--bg)] p-2.5 ' +
          'text-[16px] leading-relaxed outline-none sm:text-[13px] ' +
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

  /**
   * **눌린 상태를 따로 구독한다.**
   *
   * TipTap 3 은 트랜잭션마다 컴포넌트를 다시 그리지 않는다(2 에서 바뀐
   * 점이다). 그래서 `editor.isActive('bold')` 를 그리는 김에 읽어 두면
   * **굵게를 눌러도 단추가 그대로였다** — 글자를 한 자 치고 나서야 켜진
   * 것으로 보였다. 눌렀는지 아닌지를 사람이 알 수 없는 토글은 토글이 아니다.
   *
   * 매 트랜잭션마다 다시 그리게 켜는 길도 있지만, 그러면 글자를 칠 때마다
   * 도구 모음 열두 개가 같이 그려진다. 필요한 값만 골라 구독한다.
   */
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      strike: e?.isActive('strike') ?? false,
      code: e?.isActive('code') ?? false,
      headings: RICH_TEXT_HEADING_LEVEL.map((level) => e?.isActive('heading', { level }) ?? false),
      bulletList: e?.isActive('bulletList') ?? false,
      orderedList: e?.isActive('orderedList') ?? false,
      blockquote: e?.isActive('blockquote') ?? false,
      link: e?.isActive('link') ?? false,
    }),
  });

  if (!editor || !active) {
    // 불러오는 동안에도 자리는 잡아 둔다 — 안 그러면 폼이 덜컥 뛴다
    return <div className="min-h-60 rounded-sm border border-[var(--border-strong)] bg-[var(--surface)]" />;
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
        /*
         * **폰에서는 한 줄로 두고 옆으로 민다.** 손가락 크기(44px)로 키운 단추
         * 열둘을 접으면 세 줄 132px 이 되는데, 키보드가 올라온 화면에서 그건
         * 본문 자리를 통째로 먹는다. 접는 대신 밀어 본다.
         *
         * **글을 쓰는 동안 붙어 있어야 한다.** 도구 모음이 위로 흘러가 버리면
         * 굵게 하나 누르려고 화면을 되감아야 한다. 운영 화면의 머리띠(h-14)
         * 아래에 선다 — 넓은 화면에는 그 띠가 없으므로 맨 위다.
         */
        className={
          'sticky top-14 z-10 flex gap-1 overflow-x-auto rounded-t-sm border border-[var(--border-strong)] ' +
          'bg-[var(--surface)] p-1.5 md:top-0 sm:flex-wrap sm:overflow-visible'
        }
      >
        <ToolbarButton editor={editor} label="굵게" active={active.bold}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolbarButton editor={editor} label="기울임" active={active.italic}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolbarButton editor={editor} label="취소선" active={active.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()} />
        <ToolbarButton editor={editor} label="코드" active={active.code}
          onClick={() => editor.chain().focus().toggleCode().run()} />

        {RICH_TEXT_HEADING_LEVEL.map((level, i) => (
          <ToolbarButton
            key={level}
            editor={editor}
            label={`제목${level - 1}`}
            active={active.headings[i] ?? false}
            onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
          />
        ))}

        <ToolbarButton editor={editor} label="글머리" active={active.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()} />
        <ToolbarButton editor={editor} label="번호" active={active.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()} />
        <ToolbarButton editor={editor} label="인용" active={active.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()} />
        <ToolbarButton editor={editor} label="구분선" active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()} />
        <ToolbarButton
          editor={editor}
          label="링크"
          active={active.link}
          onClick={() => {
            setLinkHref(active.link ? (editor.getAttributes('link')['href'] ?? '') : '');
            setLinkOpen((open) => !open);
          }}
        />
      </div>

      {linkOpen && (
        /*
         * **좁은 화면에서 이 줄이 무너져 있었다.** 라벨 "주소" 와 단추 "적용"
         * 이 한 자씩 줄바꿈돼 세로로 섰다 — flex 항목은 기본으로 자기 글자보다
         * 좁아지지 않는데, 주소 칸이 남는 폭을 다 가져가 버렸기 때문이다.
         * 줄어들 수 있는 것은 주소 칸 하나뿐이라고 못 박는다(min-w-0).
         *
         * 자리 검사가 이것을 못 봤다 — 링크 줄은 눌러야 나오므로 화면을 그냥
         * 열어서는 없는 것이다. 그래서 layout-admin 이 눌러 보고 재게 했다.
         */
        <div className="flex items-center gap-2 border-x border-[var(--border-strong)] bg-[var(--surface)] px-1.5 pb-1.5">
          <label htmlFor={linkId} className="shrink-0 text-[12px] text-[var(--fg-muted)]">
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
            placeholder="https://…"
            className={
              // 16px 아래면 iOS 가 확대한다 — 편집 영역과 같은 이유다
              'h-11 min-w-0 flex-1 rounded-sm border border-[var(--border-strong)] bg-[var(--bg)] px-2 ' +
              'text-[16px] sm:h-8 sm:text-[12px]'
            }
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-11 shrink-0 rounded-sm border border-[var(--border-strong)] px-3 text-[13px] sm:h-8 sm:px-2.5 sm:text-[12px]"
          >
            {/*
              **단추 이름이 무슨 일이 일어날지 말한다.** 예전에는 자리글에
              "비우면 링크를 뗀다" 고 적어 두었는데, 폰에서는 그 자리글이
              잘려서 안 보였고 자리글은 글자를 넣는 순간 사라진다 — 정작
              뗄 때 읽을 수 없는 안내였다.
            */}
            {active.link && linkHref.trim().length === 0 ? '링크 떼기' : '적용'}
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
    </div>
  );
}
