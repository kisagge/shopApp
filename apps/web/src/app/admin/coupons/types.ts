import type { CouponStatus, CouponTargetType } from '@shop/core';

/** 쿠폰 화면 세 조각이 함께 쓰는 모양. */

export interface CouponRow {
  id: string;
  code: string;
  name: string;
  kind: string;
  value: number;
  percent: number;
  maxDiscount: number | null;
  minimumOrder: number;
  issueLimit: number | null;
  issuedCount: number;
  usedCount: number;
  startsAt: string | Date;
  endsAt: string | Date;
  isActive: boolean;
  downloadable: boolean;
  status: CouponStatus;
  editable: boolean;
  targetCount: number;
  /**
   * 걸어 둔 대상 — "지정 3개" 만으로는 무엇에 걸었는지 알 수 없다.
   *
   * 죽은 자리(어떤 상품에도 안 붙는 대상)를 **대상마다** 들고 있다: 쿠폰 단위로 "하나가 죽었다"
   * 만 알면 스무 줄 중 어느 것인지 찾느라 눈으로 훑어야 한다.
   */
  targets: readonly CouponTarget[];
}

export interface CouponTarget {
  type: CouponTargetType;
  name: string;
  dead: boolean;
}

export interface NamedOption { id: string; name: string }

/** 폼이 고르는 중인 대상. 종류 목록은 core 가 들고 있다(계약도 같은 목록을 쓴다) */
export type Target = { targetType: CouponTargetType; targetId: string };
