import type { CouponStatus } from '@shop/core';

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
  /** 대상 이름 — "지정 3개" 만으로는 무엇에 걸었는지 알 수 없다 */
  targetNames: readonly string[];
  /** 상위 분류처럼 **어떤 상품에도 붙지 않는** 대상이 섞여 있는가 */
  deadTargets: boolean;
}

export interface NamedOption { id: string; name: string }

export type Target = { targetType: 'PRODUCT' | 'BRAND' | 'CATEGORY'; targetId: string };
