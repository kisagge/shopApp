'use client';

import { useEffect, useRef } from 'react';

/**
 * 펼쳤다 접는 폼에서 초점을 챙긴다.
 *
 * 이 저장소의 펼침 폼들은 **여는 순간 버튼이 사라지고** 그 자리를 폼이
 * 차지한다. 그래서 평범한 disclosure 와 다르다 — 버튼이 남아 있으면
 * 초점도 거기 남지만, 사라지면 초점이 `<body>` 로 떨어진다.
 *
 * 떨어지면 키보드 사용자는 **자기 자리를 잃는다.** 탭을 눌러도 문서 맨
 * 앞부터 다시 시작하고, 낭독기는 방금 무엇이 열렸는지 말하지 않는다.
 * 닫을 때도 마찬가지다.
 *
 * 자동 검사로는 안 잡힌다. axe 는 **정지한 화면의 마크업**을 보지,
 * 누른 뒤 초점이 어디로 갔는지는 보지 않는다.
 *
 * 규칙은 둘이다.
 *   · 열면 폼으로 간다 — 버튼이 사라졌으니 갈 곳을 정해 줘야 한다
 *   · 닫으면 버튼으로 돌아온다 — 누른 자리로 되돌리는 것이 예상되는 동작이다
 *
 * **폼 안 첫 칸이 아니라 폼 자체로 옮긴다.** 첫 칸을 짚으면 마크업 순서가
 * 바뀔 때마다 조용히 어긋나고, 낭독기는 그 칸만 읽어 무엇이 열렸는지를
 * 말하지 않는다. 폼에 이름을 달아 두면 "신고 사유, 양식" 처럼 무엇이
 * 열렸는지부터 읽는다.
 *
 * 처음 그릴 때는 아무것도 하지 않는다. 화면에 폼이 닫힌 채로 여럿 있는데
 * 그때마다 초점을 옮기면 페이지를 열자마자 초점이 튄다.
 */
export function useDisclosureFocus(open: boolean): {
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  panelRef: React.RefObject<HTMLFormElement | null>;
} {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLFormElement>(null);
  /** 한 번이라도 열렸는가. 처음 그릴 때 버튼으로 초점을 끌어오지 않기 위해서다. */
  const opened = useRef(false);

  useEffect(() => {
    if (open) {
      opened.current = true;
      panelRef.current?.focus();
      return;
    }
    if (opened.current) {
      opened.current = false;
      triggerRef.current?.focus();
    }
  }, [open]);

  return { triggerRef, panelRef };
}
