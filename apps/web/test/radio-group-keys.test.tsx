// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { useState } from 'react';
import { useRadioGroup } from '~/lib/a11y/use-radio-group';

/**
 * 버튼으로 만든 라디오 묶음의 키보드 동작.
 *
 * `role="radiogroup"` 을 얹으면 낭독기는 **네이티브 라디오처럼 다뤄지리라
 * 기대한다.** 그런데 결제 수단과 상품 옵션 둘 다 버튼을 나열해 두었을 뿐이라
 * 화살표가 아무 일도 하지 않았고, 항목 전부가 탭 순서에 있었다.
 *
 * **axe 로는 안 잡힌다.** 마크업은 완벽하다 — role 도 aria-checked 도 제자리에
 * 있다. 없는 것은 동작이고, 정지한 화면에는 동작이 찍히지 않는다.
 */

function Group({ soldOut = [] }: { soldOut?: readonly string[] }) {
  const sizes = ['S', 'M', 'L', 'XL'] as const;
  const [checked, setChecked] = useState<string | null>(null);
  const { groupProps, radioProps } = useRadioGroup({
    items: sizes.map((s) => ({ id: s, disabled: soldOut.includes(s) })),
    checked,
    onSelect: setChecked,
  });

  return (
    <div role="radiogroup" aria-label="사이즈" {...groupProps}>
      {sizes.map((s) => (
        <button
          key={s}
          type="button"
          role="radio"
          aria-checked={checked === s}
          aria-disabled={soldOut.includes(s)}
          {...radioProps(s)}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

const radios = () => screen.getAllByRole('radio');
const tabbable = () => radios().filter((r) => r.getAttribute('tabindex') === '0');

describe('라디오 묶음 — 키보드', () => {
  it('탭으로 들어올 자리가 하나뿐이다', () => {
    /*
     * 전부 탭 순서에 있으면 사이즈가 여덟 개일 때 탭을 여덟 번 눌러야 다음
     * 칸으로 넘어간다. 규칙은 하나만 두고 나머지는 빼는 것이다.
     */
    render(<Group />);
    expect(tabbable()).toHaveLength(1);
  });

  it('아무것도 안 골랐으면 첫 항목으로 들어온다', () => {
    // 하나도 0 이 아니면 묶음 전체가 탭 순서에서 빠져 키보드로 못 들어간다
    render(<Group />);
    expect(tabbable()[0]).toHaveTextContent('S');
  });

  it('오른쪽 화살표로 다음을 고른다', async () => {
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(radios()[1]).toHaveAttribute('aria-checked', 'true');
    // 고르는 것과 초점이 함께 움직인다 — 네이티브 라디오가 그렇게 동작한다
    expect(document.activeElement).toBe(radios()[1]);
  });

  it('왼쪽 화살표로 이전을 고른다', async () => {
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}{ArrowLeft}');

    expect(radios()[1]).toHaveAttribute('aria-checked', 'true');
  });

  it('선택값이 아니라 초점에서 출발한다', async () => {
    /*
     * 로빙 tabindex 때문에 보통 둘은 같다. 어긋나면 사용자가 보고 있는 쪽을
     * 따라야 한다 — 안 그러면 화살표를 눌렀는데 화면의 다른 곳이 움직인다.
     */
    render(<Group />);
    radios()[3]!.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(radios()[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('끝에서 처음으로 돈다', async () => {
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');

    expect(radios()[3]).toHaveAttribute('aria-checked', 'true');
  });

  it('Home 과 End 로 양 끝으로 간다', async () => {
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(radios()[3]).toHaveAttribute('aria-checked', 'true');

    await userEvent.keyboard('{Home}');
    expect(radios()[0]).toHaveAttribute('aria-checked', 'true');
  });

  it('품절 항목은 건너뛴다', async () => {
    // 보이되 고를 수 없는 것에 멈춰 설 이유가 없다
    render(<Group soldOut={['M']} />);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');

    expect(radios()[1]).toHaveAttribute('aria-checked', 'false');
    expect(radios()[2]).toHaveAttribute('aria-checked', 'true');
  });

  it('고르고 나면 탭 자리가 그리로 옮겨 간다', async () => {
    // 다시 탭으로 들어왔을 때 방금 고른 곳에서 이어져야 한다
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');

    expect(tabbable()).toHaveLength(1);
    expect(tabbable()[0]).toHaveTextContent('L');
  });

  it('관계없는 키는 그냥 지나간다', async () => {
    render(<Group />);
    radios()[0]!.focus();
    await userEvent.keyboard('a');

    expect(radios().every((r) => r.getAttribute('aria-checked') === 'false')).toBe(true);
  });
});
