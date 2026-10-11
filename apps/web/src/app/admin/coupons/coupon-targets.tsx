import { Badge } from '@shop/ui';
import { COUPON_TARGET_LABEL } from '@shop/core';
import type { CouponTarget } from './types';

/** 접었을 때 적는 수 — 표 한 칸이 세로로 늘어지면 목록 자체를 못 읽는다 */
const SHOWN = 3;

/**
 * 쿠폰을 **무엇에 걸었나.**
 *
 * 이 칸에는 "지정 3개" 만 있었다. 대상은 만들 때만 정하고 다시 열어 볼 화면이 없으니 그 수를 보고
 * 할 수 있는 일이 없고, 상위 분류에 걸어 **어떤 상품에도 붙지 않는** 쿠폰이 멀쩡한 쿠폰과 똑같이
 * 보였다. 이름을 적기 시작했지만 셋까지였고, 스무 개를 걸어 둔 쿠폰은 "외 17개" 뒤에 가려졌다.
 *
 * 그래서 **펼칠 수 있게** 한다. `details` 는 글자를 키우거나 자바스크립트가 늦게 와도 혼자 열리고,
 * 낭독기가 "접힌 묶음" 으로 읽어 준다 — 단추와 상태를 손으로 만들면 그것부터 틀린다.
 *
 * 죽은 대상이 먼저 선다(조회가 그렇게 세워 준다). 그래서 접힌 줄에 이미 보인다 — 문제를 보려고
 * 펼쳐야 하면, 펼치지 않은 사람은 문제가 없다고 믿는다.
 */
export function CouponTargets({ targets }: { targets: readonly CouponTarget[] }) {
  const dead = targets.filter((t) => t.dead);
  const head = targets.slice(0, SHOWN).map((t) => t.name).join(', ');
  const rest = targets.length - SHOWN;

  return (
    <span className="flex flex-col items-start gap-1">
      {rest > 0 ? (
        <details className="[&[open]>summary]:mb-1">
          <summary className="cursor-pointer marker:text-[var(--fg-muted)]">
            {head}
            <span className="tnum text-[var(--fg-muted)]"> 외 {rest}개</span>
          </summary>
          <ul className="flex flex-col gap-0.5 pl-1">
            {targets.map((t, i) => (
              <li key={`${t.type}:${t.name}:${i}`}>
                {t.name}
                <span className="text-[var(--fg-muted)]"> ({COUPON_TARGET_LABEL[t.type]})</span>
                {t.dead && <span className="text-accent"> — 붙는 상품 없음</span>}
              </li>
            ))}
          </ul>
        </details>
      ) : (
        <span>{head}</span>
      )}
      {dead.length > 0 && (
        <>
          <Badge tone="danger">
            붙는 상품 없음{dead.length > 1 && <span className="tnum"> {dead.length}개</span>}
          </Badge>
          <span className="text-[11px] text-[var(--fg-muted)]">
            상위 분류는 상품에 직접 붙지 않습니다. 하위 분류로 다시 만들어 주세요.
          </span>
        </>
      )}
    </span>
  );
}
