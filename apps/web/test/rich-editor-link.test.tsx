// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from './render';
import userEvent from '@testing-library/user-event';
import { RICH_TEXT_HEADING_LEVEL, type RichTextDoc } from '@shop/core';

const { RichEditor } = await import('~/app/admin/support/rich-editor');

/**
 * 공지·FAQ 편집기의 **도구 모음과 링크 줄**.
 *
 * 이미 보고 있는 것과 나누어 둔다 — 눌림 표시와 칸의 역할은 e2e
 * (`rich-editor.spec`)가 진짜 브라우저에서 보고, 명령의 속사정은
 * `rich-editor-list`, 어휘는 `rich-editor-vocabulary` 가 본다.
 *
 * **아무 데서도 안 보던 것이 링크 줄 전체였다.** 눌러야 나오는 자리라 화면을
 * 그냥 열어서는 없는 것이고, 거기 적힌 까닭 셋이 전부 증명된 적이 없었다:
 * 폼 안에서 Enter 가 저장까지 눌러 버리는 것, 단추 이름이 무슨 일이 일어날지
 * 말하는 것(자리글은 폰에서 잘리고 글자를 넣으면 사라진다), 그리고 주소를
 * 받아 줄지 말지는 core 가 정한다는 것.
 *
 * 그리고 **이 편집기가 HTML 이 아니라 나무를 내보낸다**는 설계 — 공개 화면이
 * 남이 쓴 마크업을 실행하지 않는 까닭 — 도 여기서 처음 못 박는다.
 *
 * **여기서 못 보는 것 둘.** `role="textbox"` 는 이 계산기가 `contenteditable` 을
 * 이미 textbox 로 보아 떼어도 통과하고, 단추를 누른 뒤 초점이 편집 영역으로
 * 돌아오는 것은 jsdom 에서 재현되지 않는다(진짜 배치가 없다). 둘 다 돌연변이로
 * 확인했고, 진짜 브라우저 쪽은 e2e 가 본다.
 */

const doc = (text = '본문입니다'): RichTextDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const onChange = vi.fn<(doc: RichTextDoc) => void>();

const editor = (value: RichTextDoc = doc()) => {
  const result = render(
    <>
      <span id="body-label">본문</span>
      <RichEditor value={value} onChange={onChange} labelledBy="body-label" />
    </>,
  );
  return result;
};

const toolbar = () => screen.getByRole('toolbar', { name: '글자 서식' });
const button = (label: string) => within(toolbar()).getByRole('button', { name: label });
const linkRow = () => screen.queryByLabelText('주소');

/*
 * **주소를 칠 때는 핸들러를 직접 두드린다.**
 *
 * 편집기(ProseMirror)가 초점을 되가져간다 — 칸을 눌러 초점을 옮긴 직후에도
 * 활성 요소가 편집 영역이라, `userEvent.type` 의 둘째 글자부터는 칸이 아니라
 * 편집기로 들어간다(첫 글자만 들어가 'h' 하나로 통과하던 검사를 그렇게 찾았다).
 * 진짜 브라우저는 초점을 빼앗지 않고, 그쪽은 e2e(`rich-editor.spec`)가 본다.
 * 여기서 보려는 것은 칸의 값이 바뀌었을 때와 Enter 가 왔을 때 이 조각이 무엇을
 * 하는가이므로, 그 두 가지를 그대로 보낸다.
 */
const typeHref = (href: string) => fireEvent.change(linkRow()!, { target: { value: href } });
const pressEnter = () => fireEvent.keyDown(linkRow()!, { key: 'Enter' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('도구 모음', () => {
  it('하나의 도구 모음으로 묶이고, 무엇을 꾸미는지 가리킨다', () => {
    editor();

    expect(toolbar()).toHaveAttribute('aria-controls', 'body-label');
    expect(within(toolbar()).getAllByRole('button')).toHaveLength(12);
  });

  it('제목 단추는 core 가 정한 단계에서 이름을 얻는다 — h1 은 아예 없다', () => {
    editor();

    expect(RICH_TEXT_HEADING_LEVEL).toEqual([2, 3, 4]);
    for (const level of RICH_TEXT_HEADING_LEVEL) {
      expect(button(`제목${level - 1}`)).toBeInTheDocument();
    }
    expect(within(toolbar()).queryByRole('button', { name: '제목0' })).toBeNull();
  });

  it('모든 단추가 눌린 상태를 말한다 — 색으로만 알리면 낭독기는 모른다', () => {
    editor();

    for (const b of within(toolbar()).getAllByRole('button')) {
      expect(b, b.textContent ?? '').toHaveAttribute('aria-pressed');
    }
  });

  it('구분선은 어떤 상태에서도 켜지지 않는다 — 한 번 넣는 것이지 토글이 아니다', async () => {
    editor();
    expect(button('구분선')).toHaveAttribute('aria-pressed', 'false');

    // 다른 단추가 켜진 상태에서도 따라 켜지지 않는다
    await userEvent.click(button('링크'));
    typeHref('https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(button('링크')).toHaveAttribute('aria-pressed', 'true');
    expect(button('구분선')).toHaveAttribute('aria-pressed', 'false');
  });

  it('편집 영역은 이름이 붙은 여러 줄 칸이다', () => {
    /*
     * **`role="textbox"` 자체는 여기서 못 박히지 않는다.** 이 계산기는
     * `contenteditable` 을 이미 textbox 로 보기 때문에, 역할을 떼어도 이 단정은
     * 그대로 통과한다(돌연변이로 재 봤다). 진짜 브라우저의 접근성 트리에서는
     * 이름도 역할도 없는 `generic` 으로 떴고, 그쪽은 e2e 가 본다
     * (`rich-editor.spec` — "편집 영역은 이름과 역할을 가진 칸이다").
     *
     * 여기서 보는 것은 **이름이 바깥 제목에 묶였는지**와 여러 줄임을 밝히는지다.
     */
    editor();
    const box = screen.getByRole('textbox');

    expect(box).toHaveAttribute('aria-multiline', 'true');
    expect(box).toHaveAccessibleName('본문');
  });
});

describe('바꾼 것을 내보내는 모양', () => {
  it('HTML 문자열이 아니라 나무를 준다 — 공개 화면이 남의 마크업을 실행하지 않는 까닭', () => {
    editor();
    button('제목1').click();

    expect(onChange).toHaveBeenCalledTimes(1);
    const sent = onChange.mock.calls[0]![0];
    expect(typeof sent).toBe('object');
    expect(sent.type).toBe('doc');
    expect(sent.content[0]).toMatchObject({
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: '본문입니다' }],
    });
  });

  it('구분선을 넣으면 그 노드가 나무에 들어온다', () => {
    editor();
    button('구분선').click();

    const sent = onChange.mock.calls[0]![0];
    expect(sent.content.some((n) => n.type === 'horizontalRule')).toBe(true);
  });

  it('아무것도 안 건드리면 내보내지 않는다', () => {
    editor();

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('링크 줄', () => {
  it('처음에는 없다 — 눌러야 나온다', () => {
    editor();

    expect(linkRow()).toBeNull();
  });

  it('링크를 누르면 주소 칸이 열리고, 다시 누르면 닫힌다', async () => {
    editor();
    await userEvent.click(button('링크'));

    const input = linkRow()!;
    expect(input).toHaveAttribute('placeholder', 'https://…');
    expect(input).toHaveValue('');

    await userEvent.click(button('링크'));
    expect(linkRow()).toBeNull();
  });

  it('적용하면 줄이 닫히고, 단추가 켜진다 — 고른 글자가 없으면 다음에 치는 글자에 걸린다', async () => {
    /*
     * **나무는 안 바뀐다.** 글자를 고르지 않은 채로 주소를 적용하면 ProseMirror 는
     * 굵게와 같은 "다음 글자에 걸 표식" 으로 들고 있는다 — 문서가 그대로이므로
     * 내보낼 것도 없다. 단추만 켜져서 다음에 치는 글자가 링크가 된다는 것을 알린다.
     */
    editor();
    await userEvent.click(button('링크'));
    typeHref('https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(linkRow()).toBeNull();
    expect(button('링크')).toHaveAttribute('aria-pressed', 'true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('링크가 걸린 자리에서 다시 열면 지금 주소가 들어 있다 — 고치러 여는 것이다', async () => {
    editor();
    await userEvent.click(button('링크'));
    typeHref('https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    await userEvent.click(button('링크'));
    expect(linkRow()).toHaveValue('https://example.com');
  });

  it('칸을 비우면 단추 이름이 링크 떼기로 바뀐다 — 자리글로는 못 알린다', async () => {
    /*
     * 예전에는 자리글에 "비우면 링크를 뗀다" 고 적어 두었는데, 폰에서는 잘려 안
     * 보였고 자리글은 글자를 넣는 순간 사라진다 — 정작 뗄 때 읽을 수 없는 안내였다.
     */
    editor();
    await userEvent.click(button('링크'));
    typeHref('https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    await userEvent.click(button('링크'));
    expect(screen.getByRole('button', { name: '적용' })).toBeInTheDocument();

    typeHref('');
    expect(screen.getByRole('button', { name: '링크 떼기' })).toBeInTheDocument();
  });

  it('비운 채로 적용하면 링크를 뗀다', async () => {
    editor();
    await userEvent.click(button('링크'));
    typeHref('https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(button('링크')).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(button('링크'));
    typeHref('');
    await userEvent.click(screen.getByRole('button', { name: '링크 떼기' }));

    expect(linkRow()).toBeNull();
    expect(button('링크')).toHaveAttribute('aria-pressed', 'false');
  });

  it('받아 줄 수 없는 주소는 아무것도 바꾸지 않는다 — 받는 목록은 core 가 정한다', async () => {
    /*
     * **나무로는 안 보인다.** 고른 글자가 없으면 걸어도 문서가 안 바뀌어 어느
     * 쪽이든 내보낼 것이 없다(돌연변이가 그래서 살아남았다). 걸렸는지는 **단추의
     * 눌림**으로 드러난다 — 안 걸렸으면 다음에 치는 글자도 링크가 되지 않는다.
     */
    editor();
    await userEvent.click(button('링크'));
    typeHref('javascript:alert(1)');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));

    expect(button('링크')).toHaveAttribute('aria-pressed', 'false');
    expect(onChange).not.toHaveBeenCalled();
    expect(linkRow()).toBeNull();
  });

  it('Enter 로 적용하면 기본 동작을 막는다 — 폼 안이라 저장까지 눌러 버린다', async () => {
    /*
     * **jsdom 은 Enter 로 폼을 제출하지 않는다.** 그래서 "저장이 안 됐다" 로는
     * 아무것도 증명되지 않는다(그렇게 적었다가 돌연변이가 살아남았다). 막았는지를
     * 직접 본다 — `fireEvent` 는 기본 동작이 막히면 거짓을 돌려준다.
     */
    render(
      <form onSubmit={(e) => e.preventDefault()}>
        <span id="body-label">본문</span>
        <RichEditor value={doc()} onChange={onChange} labelledBy="body-label" />
        <button type="submit">저장</button>
      </form>,
    );
    await userEvent.click(button('링크'));
    typeHref('https://example.com');

    expect(pressEnter(), 'Enter 의 기본 동작을 막지 않았다').toBe(false);
    expect(linkRow()).toBeNull();
  });

  it('Enter 가 아닌 키는 가로막지 않는다 — 치는 동안 줄이 닫히면 안 된다', async () => {
    editor();
    await userEvent.click(button('링크'));
    typeHref('https://exa');
    fireEvent.keyDown(linkRow()!, { key: 'm' });

    expect(linkRow()).toHaveValue('https://exa');
  });
});
