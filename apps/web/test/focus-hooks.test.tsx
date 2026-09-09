// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { render, screen } from './render';
import { useRemovalFocus } from '~/lib/a11y/use-removal-focus';
import { useDisclosureFocus } from '~/lib/a11y/use-disclosure-focus';

/**
 * 초점이 어디로 가는지.
 *
 * **자동 접근성 훑기가 구조적으로 못 잡는 자리다.** axe 는 정지한 화면의
 * 마크업을 보지, 누른 뒤 초점이 어디로 갔는지는 보지 않는다. 지우기 전이나
 * 후나 마크업은 멀쩡하다.
 *
 * 규칙을 훅에 모아 두었고 그 훅을 쓰는지는 `disclosure-focus` 가 지킨다.
 * 정작 **훅 자체가 무엇을 하는지**는 아무도 안 보고 있었다 —
 * `useRemovalFocus` 는 일곱 화면이 쓴다.
 */

function List({ initial }: { initial: readonly string[] }) {
  const [items, setItems] = useState([...initial]);
  const { listRef, emptyRef, rememberRemoval } = useRemovalFocus(items.length);

  if (items.length === 0) {
    return (
      <p ref={emptyRef as React.RefObject<HTMLParagraphElement>} tabIndex={-1}>
        비었습니다
      </p>
    );
  }

  return (
    <ul ref={listRef as React.RefObject<HTMLUListElement>}>
      {items.map((name, index) => (
        <li key={name}>
          {name}
          <button
            type="button"
            data-remove-row
            onClick={() => {
              rememberRemoval(index);
              setItems((prev) => prev.filter((n) => n !== name));
            }}
          >
            {name} 지우기
          </button>
        </li>
      ))}
    </ul>
  );
}

const remove = (name: string) => userEvent.click(screen.getByRole('button', { name: `${name} 지우기` }));

describe('목록에서 줄을 지웠을 때', () => {
  it('초점이 <body> 로 떨어지지 않는다 — 떨어지면 탭을 문서 맨 앞부터 다시 눌러야 한다', async () => {
    render(<List initial={['가', '나', '다']} />);

    await remove('가');

    expect(document.activeElement).not.toBe(document.body);
  });

  it('지운 자리의 다음 줄로 간다 — 위에서 아래로 지워 나가는 동작이 끊기지 않는다', async () => {
    render(<List initial={['가', '나', '다']} />);

    await remove('나');

    expect(document.activeElement).toHaveAccessibleName('다 지우기');
  });

  it('마지막을 지우면 그 앞줄로 간다', async () => {
    render(<List initial={['가', '나', '다']} />);

    await remove('다');

    expect(document.activeElement).toHaveAccessibleName('나 지우기');
  });

  it('연달아 지워도 자리를 지킨다', async () => {
    render(<List initial={['가', '나', '다', '라']} />);

    await remove('나');
    expect(document.activeElement).toHaveAccessibleName('다 지우기');

    await remove('다');
    expect(document.activeElement).toHaveAccessibleName('라 지우기');
  });

  it('다 지우면 목록이 있던 자리를 대신하는 것으로 간다', async () => {
    render(<List initial={['가']} />);

    await remove('가');

    expect(document.activeElement).toHaveTextContent('비었습니다');
  });

  /** 화면을 열자마자 초점이 튀면, 스크롤 위치까지 함께 움직인다. */
  it('지운 적이 없으면 초점을 건드리지 않는다', () => {
    render(<List initial={['가', '나']} />);

    expect(document.activeElement).toBe(document.body);
  });
});

function Disclosure() {
  const [open, setOpen] = useState(false);
  const { triggerRef, panelRef } = useDisclosureFocus(open);

  return open ? (
    <form ref={panelRef} tabIndex={-1} aria-label="신고 사유">
      <button type="button" onClick={() => setOpen(false)}>
        닫기
      </button>
    </form>
  ) : (
    <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
      신고
    </button>
  );
}

describe('여는 순간 버튼이 사라지는 폼', () => {
  it('열면 폼으로 간다 — 누른 버튼이 사라졌으니 갈 곳을 정해 줘야 한다', async () => {
    render(<Disclosure />);

    await userEvent.click(screen.getByRole('button', { name: '신고' }));

    // 폼 안 첫 칸이 아니라 폼 자체다. 낭독기가 무엇이 열렸는지부터 읽는다.
    expect(document.activeElement).toHaveAccessibleName('신고 사유');
  });

  it('닫으면 누른 버튼으로 돌아온다', async () => {
    render(<Disclosure />);

    await userEvent.click(screen.getByRole('button', { name: '신고' }));
    await userEvent.click(screen.getByRole('button', { name: '닫기' }));

    expect(document.activeElement).toHaveAccessibleName('신고');
  });

  it('처음 그릴 때는 초점을 끌어오지 않는다 — 닫힌 폼이 여럿이면 화면이 튄다', () => {
    render(
      <>
        <Disclosure />
        <Disclosure />
      </>,
    );

    expect(document.activeElement).toBe(document.body);
  });
});
