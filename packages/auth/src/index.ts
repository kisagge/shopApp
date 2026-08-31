import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { prisma } from '@shop/db';

/**
 * Better Auth 서버 인스턴스.
 *
 * 쿠키와 Bearer 토큰을 둘 다 지원한다. 이게 next-auth v5 대신 이걸 고른 이유다 —
 * Capacitor 웹뷰는 앱 재시작 후 쿠키가 날아가는 경우가 있어서, 네이티브 셸은
 * 토큰을 Keychain 에 넣어 두고 Bearer 로 붙일 수 있어야 한다.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL,

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // 포트폴리오라 메일 발송을 붙이지 않았다. 실서비스에서는 반드시 켠다.
    requireEmailVerification: false,
  },

  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일
    updateAge: 60 * 60 * 24,      // 하루 지나면 만료를 늘린다
    cookieCache: {
      // 매 요청마다 세션을 조회하면 서버리스에서 DB 왕복이 그대로 지연이 된다.
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  user: {
    /**
     * 세션에 실어야 하는 우리 필드.
     *
     * input: false 가 핵심이다. 이게 없으면 회원가입 요청 본문에
     * `role: "SUPER_ADMIN"` 을 넣어서 스스로 슈퍼관리자가 될 수 있다.
     *
     * analyticsConsent 는 여기 두지 않는다. Better Auth 의 필드 매핑이
     * nullable enum 을 그대로 실어 나르지 못해 "미결정" 과 "거부" 가 뭉개진다.
     * 값이 바뀌는 성격이라 세션 캐시(5분)에 두기에도 맞지 않아, 필요할 때
     * DB 에서 직접 읽는다 — 포인트 잔액과 같은 이유다.
     */
    additionalFields: {
      role: { type: 'string', required: false, defaultValue: 'CUSTOMER', input: false },
      merchantId: { type: 'string', required: false, input: false },
      phone: { type: 'string', required: false, input: true },
    },
  },

  // Bearer 토큰을 받아 세션으로 해석한다. 네이티브 셸용.
  plugins: [bearer()],

  advanced: {
    database: { generateId: false }, // Prisma 의 cuid() 를 쓴다
  },
});

export type Auth = typeof auth;
export type Session = Auth['$Infer']['Session'];
