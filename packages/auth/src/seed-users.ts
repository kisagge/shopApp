import { resolve } from 'node:path';
import { config } from 'dotenv';
import { SEED_PASSWORD, SEED_ACCOUNT, CART_ACCOUNTS } from './seed-fixtures';
config({ path: resolve(import.meta.dirname, '../../../.env'), quiet: true });

import { assertSeedTarget, prisma } from '@shop/db';
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
  phone?: string;
}

const USERS: SeedUser[] = [
  // 등급은 구매확정 금액에서 계산된다(effectiveGrade). 시드가 임의로 박으면
  // 화면의 배지와 진행률이 어긋난다.
  { email: 'demo@plain.test', name: '데모 사용자', role: 'CUSTOMER', phone: '010-0000-0000' },
  { email: 'super@plain.test', name: '슈퍼관리자', role: 'SUPER_ADMIN' },
  { email: 'admin@plain.test', name: '운영 관리자', role: 'ADMIN' },
  { email: 'contact@studionoon.test', name: '스튜디오눈 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00001' },
  { email: 'contact@atelierk.test', name: '아뜰리에케이 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00002' },
  { email: 'contact@moor.test', name: '무어 담당자', role: 'MERCHANT', merchantBusinessNumber: '000-00-00003' },

  /*
   * **장바구니를 쥐는 검사마다 손님 하나씩.**
   *
   * 서버 장바구니는 계정에 하나뿐이고 저장이 통째로 바꾸는 방식이라, 한
   * 계정을 나눠 쓰면 한 검사가 비우는 순간 다른 검사의 장바구니가 사라진다.
   * 자세한 사연은 seed-fixtures 의 SEED_ACCOUNT 주석에 적어 두었다.
   */
  { email: SEED_ACCOUNT.suspendTarget, name: '정지 검사 손님', role: 'CUSTOMER', phone: '010-0000-2001' },

  ...CART_ACCOUNTS.map((key, i) => ({
    email: SEED_ACCOUNT[key],
    name: `장바구니 손님 ${i + 1}`,
    role: 'CUSTOMER' as const,
    phone: `010-0000-100${i + 1}`,
  })),
];

async function main(): Promise<void> {
  assertSeedTarget('계정 시드');
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

  /**
   * 가입 포인트는 **여기서 주지 않는다.**
   *
   * signUpEmail 이 인증의 databaseHooks 를 태우고, 그 훅이 원장에 넣는다.
   * 시드가 따로 주면 지급 규칙이 두 벌이 되고, 진짜 가입 경로가 포인트를
   * 제대로 주는지는 아무도 확인하지 않게 된다.
   */

  const customer = await prisma.user.findUniqueOrThrow({ where: { email: 'demo@plain.test' } });

  /*
   * **id 를 손으로 짓되 id 형식은 지킨다.**
   *
   * 예전에는 `${customer.id}-default` 로 만들었는데, 그 값은 계약의 id
   * 형식(소문자·숫자 20~32자)을 통과하지 못한다. 그래서 **시드 계정은 시드
   * 주소로 주문을 넣을 수 없었다** — 화면에서는 배송지가 멀쩡히 보이는데
   * 결제만 400 으로 막혔다. 데모 경로가 통째로 막힌 셈이고, 주문 멱등성을
   * 확인하는 검사를 쓰다가 드러났다.
   *
   * 다시 돌려도 같은 주소가 되도록 값은 고정해 둔다.
   */
  const DEMO_ADDRESS_ID = 'seedaddrdemocustomer0001';

  // 옛 모양으로 만들어 둔 주소가 있으면 걷어낸다. 두면 주문할 수 없는
  // 배송지가 목록에 남는다.
  await prisma.address.deleteMany({
    where: { userId: customer.id, id: { endsWith: '-default' } },
  });

  await prisma.address.upsert({
    where: { id: DEMO_ADDRESS_ID },
    update: {},
    create: {
      id: DEMO_ADDRESS_ID, userId: customer.id, label: '집',
      recipient: '데모 사용자', phone: '010-0000-0000',
      postalCode: '04766', address1: '서울 성동구 왕십리로 000',
      address2: '101동 1102호', isDefault: true,
    },
  });

  /*
   * 장바구니 손님들에게도 배송지를 준다. **없으면 주문이 아예 안 만들어져서**
   * 결제 검사가 배송지 칸을 못 찾고 멈춘다 — 데모 계정이 그 자리를 이미 한 번
   * 겪었다. id 는 위와 같은 이유로 계약의 형식을 지킨다.
   */
  for (const [i, key] of CART_ACCOUNTS.entries()) {
    const buyer = await prisma.user.findUniqueOrThrow({ where: { email: SEED_ACCOUNT[key] } });
    const id = `seedaddrcartcustomer000${i + 1}`;
    await prisma.address.upsert({
      where: { id },
      update: {},
      create: {
        id, userId: buyer.id, label: '집',
        recipient: buyer.name, phone: `010-0000-100${i + 1}`,
        postalCode: '04766', address1: '서울 성동구 왕십리로 000',
        address2: `10${i + 1}동 1102호`, isDefault: true,
      },
    });
  }

  console.log(`계정 시드 완료 — 전부 비밀번호는 ${PASSWORD}`);
}

main()
  .catch((e: unknown) => {
    console.error('계정 시드 실패:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
