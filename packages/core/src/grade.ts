import { type Won, won, ZERO } from './money';

/**
 * 회원 등급.
 *
 * 등급은 **권한이 아니라 혜택 구간**이다. 권한은 authz 의 UserRole 이 정한다.
 * 둘을 섞으면 "VIP 니까 관리 화면도 보여 주자" 같은 사고가 난다.
 *
 * 산정 기준은 구매확정된 금액의 누계다. 결제만 하고 취소한 건 빠진다 —
 * 주문했다 취소하기를 반복해 등급을 올리는 걸 막는다.
 */

export const MEMBER_GRADE = ['BASIC', 'SILVER', 'GOLD', 'VIP'] as const;
export type MemberGrade = (typeof MEMBER_GRADE)[number];

/*
 * 등급 이름표는 여기 없다.
 *
 * 무엇이 있는지는 규칙이고 뭐라고 부를지는 화면이다. 화면이 세 나라 말로
 * 나가면서 이 자리의 한국어 표는 맞지 않게 됐다 — apps/web 의
 * lib/i18n/enum-labels 가 값 목록에서 열쇠를 만들고, 사전이 세 벌로 가진다.
 */

/** 등급별 최소 누적 구매액 */
export const GRADE_THRESHOLD: Readonly<Record<MemberGrade, Won>> = {
  BASIC: won(0),
  SILVER: won(300_000),
  GOLD: won(1_000_000),
  VIP: won(3_000_000),
};

/** 등급별 적립률(%) */
export const GRADE_REWARD_PERCENT: Readonly<Record<MemberGrade, number>> = {
  BASIC: 1,
  SILVER: 2,
  GOLD: 3,
  VIP: 5,
};

/** 누적 구매액으로 등급을 정한다 */
export function gradeFor(totalSpent: Won): MemberGrade {
  // 높은 등급부터 확인해야 한다. 낮은 쪽부터 보면 항상 BASIC 에서 멈춘다.
  for (let i = MEMBER_GRADE.length - 1; i >= 0; i -= 1) {
    const grade = MEMBER_GRADE[i]!;
    if (totalSpent >= GRADE_THRESHOLD[grade]) return grade;
  }
  return 'BASIC';
}

export function nextGrade(grade: MemberGrade): MemberGrade | null {
  const i = MEMBER_GRADE.indexOf(grade);
  return MEMBER_GRADE[i + 1] ?? null;
}

/**
 * 실제로 적용할 등급.
 *
 * DB 의 User.grade 와 구매액에서 계산한 등급이 다를 수 있다. 운영진이 수동으로
 * 올려 주는 경우(제휴·보상)가 있기 때문이다. **둘 중 높은 쪽을 쓴다** —
 * 수동으로 올려준 등급이 구매액 때문에 도로 내려가면 고객이 납득하지 못하고,
 * 구매로 올라간 등급이 반영 안 되면 그것도 말이 안 된다.
 *
 * 이걸 안 정하면 화면에 "골드" 배지를 달아 놓고 "골드까지 425,000원 남았다"고
 * 쓰는 모순이 그대로 나온다.
 */
export function effectiveGrade(totalSpent: Won, storedGrade: MemberGrade): MemberGrade {
  const earned = gradeFor(totalSpent);
  return MEMBER_GRADE.indexOf(earned) >= MEMBER_GRADE.indexOf(storedGrade) ? earned : storedGrade;
}

export interface GradeProgress {
  readonly current: MemberGrade;
  readonly next: MemberGrade | null;
  /** 다음 등급까지 남은 금액. 최고 등급이면 0 */
  readonly remaining: Won;
  /** 현재 구간에서의 진행률(%). 최고 등급이면 100 */
  readonly percent: number;
}

/**
 * storedGrade 를 주면 그 등급을 기준으로 진행률을 낸다.
 * 주지 않으면 구매액만으로 계산한다.
 */
export function gradeProgress(totalSpent: Won, storedGrade?: MemberGrade): GradeProgress {
  const current = storedGrade ? effectiveGrade(totalSpent, storedGrade) : gradeFor(totalSpent);
  const next = nextGrade(current);

  if (next === null) {
    return { current, next: null, remaining: ZERO, percent: 100 };
  }

  const floor = GRADE_THRESHOLD[current];
  const ceiling = GRADE_THRESHOLD[next];
  const span = ceiling - floor;

  // 수동으로 올려 준 등급이면 구매액이 그 구간에 못 미칠 수 있다.
  // 그때 남은 금액이 다음 등급 전체 금액으로 보이면 이상하므로 0 으로 막는다.
  const remaining = won(Math.max(0, ceiling - totalSpent));
  const progressed = Math.max(0, totalSpent - floor);

  return {
    current,
    next,
    remaining,
    percent: span === 0 ? 100 : Math.min(100, Math.floor((progressed / span) * 100)),
  };
}
