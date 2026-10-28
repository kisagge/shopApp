// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
/** **컴포넌트와 같은 자리에서 들여온다.** `@tiptap/core` 로 들여오면 prosemirror 사본이 둘이 되어
 *  "multiple versions of prosemirror-model" 로 터진다 — 실제로 그렇게 한 번 졌다. */
import { Editor } from '@tiptap/react';
import { RICH_TEXT_HEADING_LEVEL } from '@shop/core';
import { editorExtensions, applyList } from '~/app/admin/support/rich-editor';

/**
 * 제목 줄을 목록으로 바꾸기.
 *
 * **tiptap 3.32 에서 조용히 안 먹게 됐다.** 3.31 은 제목을 문단으로 되돌리는 수를 알아서 해 주었는데
 * 3.32 는 안 해 준다 — 목록 항목의 내용 규격이 `paragraph block*` 이라 **첫 줄이 문단이어야** 감싸진다.
 * 그래서 운영자가 제목을 쓰다 글머리를 눌러도 아무 일도 없고 눌림 표시도 안 켜졌다.
 *
 * **단추를 e2e 로만 보고 있었다.** 명세는 있었지만(rich-editor.spec) 한 바퀴가 6분이라 고치고 확인하는
 * 되돌이가 길다. 명령 자체를 헤드리스로 돌려 여기서 못 박는다 — 편집기 어휘를 스키마로 읽어 보는
 * `rich-editor-vocabulary` 와 같은 자리다.
 */

let editor: Editor | null = null;

const open = (content = '<p>본문</p>') => {
  editor = new Editor({ extensions: editorExtensions, content });
  editor.commands.focus();
  return editor;
};

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const onHeading = (e: Editor) =>
  RICH_TEXT_HEADING_LEVEL.some((level) => e.isActive('heading', { level }));

describe('제목 줄에서 목록 단추', () => {
  it.each(RICH_TEXT_HEADING_LEVEL)('제목%s 이던 줄이 글머리 목록이 된다', (level) => {
    const e = open();
    e.chain().focus().toggleHeading({ level }).run();
    expect(onHeading(e), '제목이 켜져야 그다음을 볼 수 있다').toBe(true);

    applyList(e, 'toggleBulletList');

    expect(e.isActive('bulletList'), '목록이 되지 않았다').toBe(true);
    expect(onHeading(e), '목록이 되었으니 제목은 꺼져야 한다').toBe(false);
  });

  it('번호 목록도 같다', () => {
    const e = open();
    e.chain().focus().toggleHeading({ level: 2 }).run();

    applyList(e, 'toggleOrderedList');

    expect(e.isActive('orderedList')).toBe(true);
    expect(onHeading(e)).toBe(false);
  });
});

describe('한 사슬로 이어 둔다', () => {
  it('한 사슬로 이어 두면 제목이 문단을 거쳐 목록이 된다', () => {
    /*
     * 두 수를 한 사슬에 두면 **되돌리기 한 번**으로 함께 풀린다. 따로 돌리면 운영자가 Ctrl+Z 를
     * 두 번 눌러야 제목으로 돌아온다.
     */
    const e = open();
    e.chain().focus().toggleHeading({ level: 2 }).run();

    e.chain().focus().setParagraph().toggleBulletList().run();

    expect(e.isActive('bulletList')).toBe(true);
  });

});

describe('문단에서는 그대로', () => {
  it('제목이 아니면 한 수로 목록이 된다', () => {
    const e = open();

    applyList(e, 'toggleBulletList');

    expect(e.isActive('bulletList')).toBe(true);
  });

  it('목록을 다시 누르면 풀린다', () => {
    const e = open();
    applyList(e, 'toggleBulletList');

    applyList(e, 'toggleBulletList');

    expect(e.isActive('bulletList'), '두 번 누르면 문단으로 돌아와야 한다').toBe(false);
  });
});
