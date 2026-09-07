'use client';

import { useEffect, useRef } from 'react';

/**
 * 목록에서 줄을 지웠을 때 초점을 챙긴다.
 *
 * 지우는 버튼은 **자기가 속한 줄과 함께 사라진다.** 그러면 초점이 `<body>` 로
 * 떨어지고, 키보드 사용자는 탭을 눌러 문서 맨 앞부터 다시 내려와야 한다.
 * 장바구니에서 세 줄을 지우려면 그 일을 세 번 한다.
 *
 * 펼침 폼(useDisclosureFocus)과 같은 뿌리인데 **갈 곳이 다르다.** 그쪽은
 * 누른 버튼이 다시 나타나므로 거기로 돌아가면 되지만, 여기서는 누른 버튼이
 * 영영 없다. 그래서 **옆 줄**로 간다 — 목록을 위에서 아래로 지워 나가는
 * 동작이 끊기지 않는다.
 *
 * axe 로는 안 잡힌다. 정지한 화면의 마크업은 지우기 전이나 후나 멀쩡하다.
 */
export function useRemovalFocus(count: number): {
  /** 지우기 버튼들을 품는 요소에 단다 */
  listRef: React.RefObject<HTMLElement | null>;
  /** 다 지워 목록이 사라졌을 때 초점이 갈 곳 */
  emptyRef: React.RefObject<HTMLElement | null>;
  /** 지우기 직전에 부른다. 몇 번째 줄이었는지 기억해 둔다. */
  rememberRemoval: (index: number) => void;
} {
  const listRef = useRef<HTMLElement>(null);
  const emptyRef = useRef<HTMLElement>(null);
  const removedAt = useRef<number | null>(null);

  const rememberRemoval = (index: number): void => {
    removedAt.current = index;
  };

  useEffect(() => {
    const index = removedAt.current;
    // 지운 적이 없으면 아무것도 하지 않는다. 화면을 열자마자 초점이 튀면 안 된다.
    if (index === null) return;
    removedAt.current = null;

    /*
     * 줄마다 하나씩 있는 지우기 버튼을 그리는 순서대로 찾는다. 인덱스로
     * 기억하지 않고 **다시 세는** 이유는, 지운 뒤의 목록만이 지금 화면의
     * 진실이기 때문이다.
     */
    const buttons = listRef.current?.querySelectorAll<HTMLElement>('[data-remove-row]');

    if (!buttons || buttons.length === 0) {
      // 다 지웠다. 목록이 있던 자리를 대신하는 것으로 간다.
      emptyRef.current?.focus();
      return;
    }

    // 지운 자리의 다음 줄. 마지막을 지웠으면 그 앞줄이 그 자리에 온다.
    buttons[Math.min(index, buttons.length - 1)]?.focus();
  }, [count]);

  return { listRef, emptyRef, rememberRemoval };
}
