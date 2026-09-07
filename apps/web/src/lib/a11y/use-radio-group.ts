'use client';

import type { KeyboardEvent } from 'react';

/**
 * 버튼으로 만든 라디오 묶음의 키보드 동작.
 *
 * `role="radiogroup"` 을 얹으면 낭독기는 **네이티브 라디오처럼 다뤄지리라
 * 기대한다.** 그런데 이 저장소의 두 곳(결제 수단 · 상품 옵션)은 버튼을 나열해
 * 두었을 뿐이라 두 가지가 없었다.
 *
 * **하나, 화살표로 옮겨 다닐 수 없었다.** 라디오 묶음은 탭으로 들어가서
 * 화살표로 고르는 것이 규칙이다. 낭독기 사용자는 "라디오 그룹" 이라는 말을
 * 듣고 화살표를 누르는데 아무 일도 일어나지 않았다.
 *
 * **둘, 항목 전부가 탭 순서에 있었다.** 사이즈가 여덟 개면 탭을 여덟 번 눌러야
 * 다음 칸으로 넘어간다. 규칙은 고른 것 하나만 탭에 두고 나머지는 빼는 것이다
 * (로빙 tabindex).
 *
 * **axe 로는 안 잡힌다.** 마크업은 완벽하다 — role 도 aria-checked 도 제자리에
 * 있다. 없는 것은 동작이고, 정지한 화면에는 동작이 찍히지 않는다.
 */

/** 어느 쪽으로 몇 칸 */
const STEP: Readonly<Record<string, number | 'first' | 'last'>> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
};

export interface RadioItem<T extends string> {
  readonly id: T;
  /** 고를 수 없는 항목. 품절 사이즈처럼 보이되 건너뛴다. */
  readonly disabled?: boolean;
}

export function useRadioGroup<T extends string>(input: {
  readonly items: readonly RadioItem<T>[];
  readonly checked: T | null;
  readonly onSelect: (id: T) => void;
}): {
  /** 묶음을 감싸는 요소에 펼친다 */
  readonly groupProps: { onKeyDown: (event: KeyboardEvent<HTMLElement>) => void };
  /** 각 라디오 버튼에 펼친다 */
  readonly radioProps: (id: T) => { tabIndex: number; 'data-radio': string };
} {
  const enabled = input.items.filter((i) => !i.disabled);

  /**
   * 탭으로 들어올 항목 하나.
   *
   * 고른 것이 있으면 그것, 없으면 첫 번째다. 아무것도 0 이 아니면 묶음 전체가
   * 탭 순서에서 빠져 **키보드로는 들어갈 수도 없다.**
   */
  const stop = input.checked !== null && enabled.some((i) => i.id === input.checked)
    ? input.checked
    : (enabled[0]?.id ?? null);

  function onKeyDown(event: KeyboardEvent<HTMLElement>): void {
    const step = STEP[event.key];
    if (step === undefined || enabled.length === 0) return;

    // 화살표로 화면이 스크롤되면 고르는 동안 자리가 흔들린다
    event.preventDefault();

    /*
     * **선택값이 아니라 초점에서 출발한다.**
     *
     * 네이티브 라디오가 그렇다. 로빙 tabindex 때문에 보통은 둘이 같지만,
     * 어긋나는 순간이 있으면 사용자가 보고 있는 것(초점)을 따라야 한다 —
     * 안 그러면 화살표를 눌렀는데 화면의 다른 곳이 움직인다.
     */
    const focused = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-radio]');
    const fromId = focused?.dataset['radio'] ?? input.checked;
    const at = enabled.findIndex((i) => i.id === fromId);
    const from = at === -1 ? 0 : at;
    const to =
      step === 'first'
        ? 0
        : step === 'last'
          ? enabled.length - 1
          : // 끝에서 처음으로 돈다. 라디오 묶음의 규칙이다.
            (from + step + enabled.length) % enabled.length;

    const next = enabled[to];
    if (!next) return;

    /*
     * **고르는 것과 초점을 함께 옮긴다.**
     *
     * 네이티브 라디오가 그렇게 동작한다 — 화살표를 누르면 초점이 옮겨지면서
     * 그 항목이 선택된다. 초점만 옮기면 낭독기는 읽어 주지만 실제로 고른
     * 것은 그대로라, 들은 것과 담기는 것이 어긋난다.
     */
    input.onSelect(next.id);
    const target = event.currentTarget.querySelector<HTMLElement>(
      `[data-radio="${CSS.escape(next.id)}"]`,
    );
    target?.focus();
  }

  return {
    groupProps: { onKeyDown },
    radioProps: (id: T) => ({ tabIndex: id === stop ? 0 : -1, 'data-radio': id }),
  };
}
