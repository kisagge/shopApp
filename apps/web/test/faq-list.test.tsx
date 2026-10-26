// @vitest-environment jsdom
import { render, screen } from './render';
import { describe, it, expect } from 'vitest';
import type { RichTextDoc } from '@shop/core';
import { FaqList } from '~/components/faq-list';

/**
 * FAQ 한 묶음.
 *
 * **스크립트 없이 열리는 자리다.** 모바일 메뉴에서는 `<details>` 를 써 보고 버렸는데(summary 가 접근성
 * 트리에 이름 없이 노출됐다), 그건 아이콘 버튼이라 이름이 없었기 때문이다. 여기 summary 안에는 질문이
 * **글자로** 들어 있어 낭독기가 그대로 읽는다 — 그 차이가 이 조각이 존재하는 이유인데 보는 검사가 없었다.
 *
 * 누가 `<button>` 과 상태로 바꿔 놓으면 눈으로는 똑같이 열리고 닫힌다. 자바스크립트가 아직 안 온 동안,
 * 혹은 끝내 안 오는 환경에서만 열리지 않는다.
 *
 * **옛 글도 계속 읽혀야 한다.** 서식 나무가 생기기 전에 쓴 글이 있고 그쪽은 평문이다 — 줄바꿈까지 살려야
 * 문단이 뭉개지지 않는다.
 */

const doc = (text: string): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const post = (over: Record<string, unknown> = {}) => ({
  id: 'f-1',
  title: '배송은 얼마나 걸리나요?',
  body: '보통 2~3일 걸립니다.\n주말은 쉽니다.',
  bodyRich: null as RichTextDoc | null,
  topic: null,
  pinned: false,
  publishedAt: new Date('2026-10-01T00:00:00Z'),
  ...over,
});

const draw = (...items: ReturnType<typeof post>[]) => render(<FaqList items={items} />);

describe('스크립트 없이 열린다', () => {
  it('details 와 summary 로 만든다 — 단추와 상태로 바꾸면 안 된다', () => {
    /*
     * 자바스크립트로 여닫으면 눈으로는 똑같다. 스크립트가 아직 안 온 동안, 혹은 끝내 안 오는
     * 환경에서만 안 열린다 — 고객센터는 그럴 때 더 필요한 화면이다.
     */
    const { container } = draw(post());
    expect(container.querySelector('details > summary')).not.toBeNull();
  });

  it('질문이 summary 안에 글자로 있다 — 낭독기가 그 이름으로 읽는다', () => {
    /*
     * 모바일 메뉴에서 `<details>` 를 버린 까닭은 summary 에 이름이 없었기 때문이다(아이콘 버튼).
     * 여기서는 질문이 글자로 들어 있어 그 문제가 없다. 그 차이가 이 조각의 근거다.
     */
    const { container } = draw(post());
    expect(container.querySelector('summary')?.textContent).toContain('배송은 얼마나 걸리나요?');
  });

  it('처음에는 닫혀 있다 — 답이 다 펼쳐져 있으면 목록이 아니다', () => {
    const { container } = draw(post(), post({ id: 'f-2', title: '교환이 되나요?' }));
    expect([...container.querySelectorAll('details')].map((d) => d.open)).toEqual([false, false]);
  });
});

describe('훑어 지나갈 수 있게', () => {
  it('목록으로 그린다', () => {
    draw(post(), post({ id: 'f-2', title: '교환이 되나요?' }));
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('질문이 없으면 항목도 없다', () => {
    const { container } = draw();
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});

describe('꾸밈은 읽히지 않는다', () => {
  it('Q 표시와 화살표는 접근성 트리에 없다 — 질문만 읽힌다', () => {
    /*
     * 여닫힘은 `<details>` 가 이미 말해 준다. 화살표까지 읽히면 질문마다 뜻 없는 글자가 따라붙는다.
     */
    const { container } = draw(post());
    const decorations = [...container.querySelectorAll('summary [aria-hidden="true"]')];

    expect(decorations.map((e) => e.textContent)).toEqual(['Q', '⌄']);
  });
});

describe('답', () => {
  it('서식 있는 글은 그 나무대로 그린다', () => {
    draw(post({ bodyRich: doc('보통 2~3일 걸립니다.') }));
    expect(screen.getByText('보통 2~3일 걸립니다.')).toBeInTheDocument();
  });

  it('서식 없이 쓰인 옛 글은 평문 그대로, 줄바꿈까지 살려 그린다', () => {
    /*
     * 나무가 생기기 전에 쓴 글이 있다. 줄바꿈을 살리지 않으면 두 문단이 한 줄로 붙는다 —
     * "주말은 쉽니다" 가 앞 문장에 이어 붙어 다른 말이 된다.
     */
    const { container } = draw(post());
    const plain = container.querySelector('details p');

    expect(plain?.textContent).toBe('보통 2~3일 걸립니다.\n주말은 쉽니다.');
    expect(plain?.className).toContain('whitespace-pre-wrap');
  });

  it('서식이 있으면 평문은 그리지 않는다 — 같은 답을 두 번 보여 주지 않는다', () => {
    const { container } = draw(post({ bodyRich: doc('서식으로 쓴 답') }));

    expect(container.textContent).toContain('서식으로 쓴 답');
    expect(container.textContent).not.toContain('주말은 쉽니다');
  });
});
