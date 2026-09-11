import { describe, it, expect } from 'vitest';
import { getSchema } from '@tiptap/core';
import { RICH_TEXT_NODE, RICH_TEXT_MARK, RICH_TEXT_HEADING_LEVEL } from '@shop/core';
import { editorExtensions } from '~/app/admin/support/rich-editor';

/**
 * **편집기가 계약보다 넓으면 사람이 벌을 받는다.**
 *
 * 어휘는 core 가 정하고 계약이 강제한다. 그런데 편집기는 자기 확장 목록대로
 * 만들 수 있는 것이 정해지므로, 둘이 어긋나면 **멀쩡히 써 놓고 저장할 때
 * 거절당한다** — 무엇이 문제인지도 화면에는 안 나온다.
 *
 * StarterKit 은 판올림 때마다 확장이 는다. 실제로 3버전에서 밑줄과 링크가
 * 새로 들어왔다. 목록을 손으로 맞춰 두는 대신, **편집기가 실제로 만드는
 * 스키마를 읽어** core 의 어휘와 대조한다.
 */

const schema = getSchema(editorExtensions);
const nodes = Object.keys(schema.nodes).filter((name) => name !== 'doc');
const marks = Object.keys(schema.marks);

describe('편집기의 어휘는 core 를 넘지 않는다', () => {
  it('스키마를 실제로 읽는다 — 못 읽으면 아래는 전부 통과한다', () => {
    expect(nodes.length, '편집기 노드를 하나도 못 읽었다').toBeGreaterThan(5);
    expect(marks.length, '편집기 마크를 하나도 못 읽었다').toBeGreaterThan(2);
  });

  it('만들 수 있는 노드가 전부 허용 목록 안에 있다', () => {
    const extra = nodes.filter((name) => !(RICH_TEXT_NODE as readonly string[]).includes(name));
    expect(
      extra,
      `편집기가 core 에 없는 노드를 만든다: ${extra.join(', ')} — core 에 들이거나 편집기에서 끄자`,
    ).toEqual([]);
  });

  it('만들 수 있는 마크가 전부 허용 목록 안에 있다', () => {
    const extra = marks.filter((name) => !(RICH_TEXT_MARK as readonly string[]).includes(name));
    expect(
      extra,
      `편집기가 core 에 없는 마크를 만든다: ${extra.join(', ')}`,
    ).toEqual([]);
  });

  it('제목 단계도 core 와 같다 — h1 을 만들 수 없다', () => {
    const levels = schema.nodes['heading']?.spec.attrs?.['level']?.default;
    expect(levels).toBeDefined();
    // 확장 설정에 담긴 단계 목록을 그대로 본다
    const heading = editorExtensions[0] as { options?: { heading?: { levels?: number[] } } };
    expect(heading.options?.heading?.levels).toEqual([...RICH_TEXT_HEADING_LEVEL]);
  });
});

describe('링크가 받는 프로토콜도 같다', () => {
  it('core 가 받는 것 밖으로 열려 있지 않다', () => {
    const link = editorExtensions[1] as { options?: { protocols?: string[] } };
    expect(link.options?.protocols).toEqual(['http', 'https', 'mailto']);
  });
});
