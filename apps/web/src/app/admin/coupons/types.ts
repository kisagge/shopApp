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
}

export interface NamedOption { id: string; name: string }

export type Target = { targetType: 'PRODUCT' | 'BRAND' | 'CATEGORY'; targetId: string };
