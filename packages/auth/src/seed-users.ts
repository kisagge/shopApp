import { resolve } from 'node:path';
import { config } from 'dotenv';
import { SEED_PASSWORD } from './seed-fixtures';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { prisma } from '@shop/db';
import type { UserRole } from '@shop/core';
import { auth } from './index';

/**
 * 개발용 계정 시드.
 *
 * 비밀번호를 직접 해시해 넣지 않고 **실제 가입 API 를 호출한다.**
 * 그래야 회원가입 경로가 동작하는지 시드를 돌릴 때마다 같이 확인된다.
 * 역할은 가입 후에 DB 에서 올린다 — 가입 요청으로는 역할을 올릴 수 없게
 * additionalFields 에 input: false 를 걸어 뒀기 때문이다.
 */

// 시드와 E2E 가 같은 값을 보도록 한곳에 둔다
const PASSWORD = SEED_PASSWORD;

interface SeedUser {
  email: string;
  name: string;
  role: UserRole;
  /** 가맹점 계정이면 사업자번호로 소속을 찾는다 */
  merchantBusinessNumber?: string;
  grade?: 'BASIC' | 'SILVER' | 'GOLD' | 'VIP';
  /** 가입 축하 포인트. 잔액만 박지 않고 원장에도 남긴다. */
  signupPoints?: number;
  phone?: string;
}

const USERS: SeedUser[] = [
  // 등급은 구매확정 금액에서 계산된다(effectiveGrade). 시드가 임의로 박으면
  // 화면의 배지와 진행률이 어긋난다.
  { email: 'demo@plain.test', name: '데모 사용자', role: 'CUSTOMER', signupPoints: 3_240, phone: '010-0000-0000' },
  { email: 'super@plain.test', name: '슈퍼관리자', role: 'SUPER_ADMIN' },
  { email: 'admin@plain.test', name: '운영 관리자', role: 'ADMIN' },
  { email: 'contact@studionoon.test', name: '스튜디오눈 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00001' },
  { email: 'contact@atelierk.test', name: '아뜰리에케이 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00002' },
  { email: 'contact@moor.test', name: '무어 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00003' },
];

async function main(): Promise<void> {
  console.log('계정 시드 시작');

  for (const u of USERS) {
    const existing = await prisma.user.findUnique({
      where: { email: u.email },
      select: { id: true, accounts: { select: { id: true } } },
    });

    let userId = existing?.id;

    if (!existing) {
      // 실제 가입 경로. 여기가 깨지면 시드도 깨진다 — 의도한 것이다.
      const result = await auth.api.signUpEmail({
        body: { email: u.email, password: PASSWORD, name: u.name },
      });
      userId = result.user.id;
      console.log(`  가입: ${u.email}`);
    } else if (existing.accounts.length === 0) {
      console.log(`  이미 있으나 비밀번호 없음: ${u.email} — 지우고 다시 돌리세요`);
      continue;
    } else {
      console.log(`  건너뜀(이미 있음): ${u.email}`);
    }

    const merchant = u.merchantBusinessNumber
      ? await prisma.merchant.findUnique({ where: { businessNumber: u.merchantBusinessNumber } })
      : null;

    // 역할 상승은 가입 요청이 아니라 여기서만 일어난다
    await prisma.user.update({
      where: { id: userId! },
      data: {
        role: u.role,
        merchantId: merchant?.id ?? null,
        emailVerified: true,
        ...(u.grade ? { grade: u.grade } : {}),
        ...(u.phone ? { phone: u.phone } : {}),
      },
    });
  }

  // 포인트는 **원장으로 준다.** 잔액만 박으면 User.pointBalance 와
  // PointTransaction 합계가 처음부터 어긋나고, 그 뒤로는 아무도 알아채지 못한다.
  for (const u of USERS) {
    if (!u.signupPoints) continue;
    const target = await prisma.user.findUniqueOrThrow({ where: { email: u.email } });
    const already = await prisma.pointTransaction.findFirst({
      where: { userId: target.id, reason: 'EARN_SIGNUP' },
    });
    if (already) continue;

    await prisma.$transaction([
      prisma.pointTransaction.create({
        data: {
          userId: target.id, amount: u.signupPoints, reason: 'EARN_SIGNUP',
          note: '가입 축하 포인트',
          expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.user.update({
        where: { id: target.id },
        data: { pointBalance: { increment: u.signupPoints } },
      }),
    ]);
    console.log(`  포인트 지급: ${u.email} +${u.signupPoints}P`);
  }

  const customer = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@plain.test' } });
  await prisma.address.upsert({
    where: { id: `${customer.id}-default` },
    update: {},
    create: {
      id: `${customer.id}-default`, userId: customer.id, label: '집',
      recipient: '데모 사용자', phone: '010-0000-0000',
      postalCode: '04766', address1: '서울 성동구 왕십리로 000',
      address2: '101동 1102호', isDefault: true,
    },
  });

  console.log(`계정 시드 완료 — 전부 비밀번호는 ${PASSWORD}`);
}

main()
  .catch((e: unknown) => {
    console.error('계정 시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
