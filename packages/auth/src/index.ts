import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { bearer } from 'better-auth/plugins';
import { verifyEmailMail, resetPasswordMail, SIGNUP_POINTS, rewardExpiresAt } from '@shop/core';
import { getMailer } from '@shop/mail';
import { prisma } from '@shop/db';

/**
 * Better Auth 서버 인스턴스.
 *
 * 쿠키와 Bearer 토큰을 둘 다 지원한다. 이게 next-auth v5 대신 이걸 고른 이유다 —
 * Capacitor 웹뷰는 앱 재시작 후 쿠키가 날아가는 경우가 있어서, 네이티브 셸은
 * 토큰을 Keychain 에 넣어 두고 Bearer 로 붙일 수 있어야 한다.
 */
const https = (host: string | undefined): string | undefined =>
  host ? `https://${host}` : undefined;

/**
 * 이 배포가 스스로를 부르는 주소.
 *
 * Better Auth 는 Origin 을 검사한다. 운영 도메인을 상수로 박아 두면
 * **프리뷰 배포마다 주소가 달라 로그인이 통째로 막힌다.**
 *
 * Vercel 이 주는 주소는 두 가지다.
 * - VERCEL_URL: **배포마다 바뀌는** 주소 (shop-abc123.vercel.app)
 * - VERCEL_PROJECT_PRODUCTION_URL: 프로젝트의 **안정된** 운영 도메인
 *
 * 운영에서 VERCEL_URL 을 쓰면 사용자가 실제로 접속하는 안정 도메인과
 * 어긋나 Invalid origin 이 난다. 실제로 그렇게 막혔다.
 */
export function resolveBaseUrl(): string | undefined {
  const explicit = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL;
  if (explicit) return explicit;

  if (process.env.VERCEL_ENV === 'production') {
    return https(process.env.VERCEL_PROJECT_PRODUCTION_URL) ?? https(process.env.VERCEL_URL);
  }
  return https(process.env.VERCEL_URL);
}

/**
 * 쿠키를 실어 보낼 수 있는 출처.
 *
 * 배포가 여러 주소로 동시에 열린다 — 안정 도메인, 브랜치 별칭, 배포별 주소.
 * 어느 쪽으로 들어와도 로그인이 돼야 하므로 전부 신뢰한다. 같은 배포를
 * 가리키는 주소들이라 넓히는 것이 아니다.
 *
 * Capacitor 웹뷰는 origin 이 capacitor:// 라 기본 검사에 걸린다.
 * 여기 없으면 앱에서 로그인 자체가 안 된다.
 */
function resolveTrustedOrigins(): string[] {
  const origins = [
    'capacitor://localhost',
    'http://localhost',
    resolveBaseUrl(),
    https(process.env.VERCEL_PROJECT_PRODUCTION_URL),
    https(process.env.VERCEL_BRANCH_URL),
    https(process.env.VERCEL_URL),
  ].filter((value): value is string => Boolean(value));

  return [...new Set(origins)];
}

/**
 * 로그인 요청 제한을 켤 것인가.
 *
 * **기본은 켜짐이다.** 무차별 대입을 막는 최소한의 장치라, NODE_ENV 나
 * 배포 환경으로 자동으로 꺼지게 두지 않는다.
 *
 * E2E 는 짧은 시간에 여러 계정으로 로그인해서 제한에 걸린다. 그때만
 * 명시적으로 끈다 — 실수로 꺼지는 일이 없도록 값을 정확히 'off' 로 적어야
 * 하고, 운영에서는 이 변수를 아예 두지 않는다.
 */
export const rateLimitEnabled = (): boolean => process.env.AUTH_RATE_LIMIT !== 'off';

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: resolveBaseUrl(),
  trustedOrigins: resolveTrustedOrigins(),

  rateLimit: { enabled: rateLimitEnabled() },

  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    /**
     * 확인 메일을 강제하지 않는다.
     *
     * 메일 발송은 붙였지만, 도메인 인증 전에는 발송 사업자가 계정 주인에게만
     * 배달한다. 여기서 강제하면 **시연용 계정으로 로그인조차 못 하게 된다.**
     * 실서비스에서는 반드시 켠다.
     */
    requireEmailVerification: false,
    async sendResetPassword({ user, url }) {
      // 실패하면 그대로 던진다. 오지 않는 메일을 기다리게 두면 안 된다.
      await getMailer().send(
        resetPasswordMail({ to: user.email, name: user.name, url }),
      );
    },
  },

  emailVerification: {
    /**
     * 가입 직후 한 번 보낸다.
     *
     * 강제하지는 않지만(위 requireEmailVerification) 주소가 맞는지 확인할
     * 기회는 준다. 확인하지 않아도 쓸 수 있다.
     */
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    async sendVerificationEmail({ user, url }) {
      /**
       * 여기서는 삼킨다. 재설정 메일과 반대다.
       *
       * 이 메일은 가입 요청 안에서 나가는데, 실패를 그대로 던지면 **메일이
       * 반송됐다는 이유로 가입 자체가 실패한다.** 확인은 필수가 아니므로
       * 계정은 만들어지는 것이 맞다. 재설정 메일은 그 메일이 곧 목적이라
       * 실패를 알려야 하고, 이쪽은 곁다리다.
       *
       * 시드가 만드는 계정은 전부 .test 주소(RFC 6761)라 실제로 반송된다.
       */
      try {
        await getMailer().send(verifyEmailMail({ to: user.email, name: user.name, url }));
      } catch (error) {
        console.error('[auth] 확인 메일 발송 실패', error);
      }
    },
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

  databaseHooks: {
    user: {
      create: {
        /**
         * 가입 축하 포인트.
         *
         * **원장으로 준다.** 잔액만 올리면 PointTransaction 합계와 처음부터
         * 어긋나고, 그 뒤로는 아무도 알아채지 못한다 — 시드가 같은 이유로
         * 같은 방식을 쓴다.
         *
         * after 훅이라 계정은 이미 만들어져 있다. 여기서 실패해도 가입을
         * 되돌리지 않는다. 포인트를 못 받는 것보다 가입이 실패하는 쪽이
         * 훨씬 나쁘고, 못 받은 것은 원장을 보면 나중에 채울 수 있다.
         */
        async after(user) {
          try {
            await prisma.$transaction([
              prisma.pointTransaction.create({
                data: {
                  userId: user.id,
                  amount: SIGNUP_POINTS,
                  reason: 'EARN_SIGNUP',
                  note: '가입 축하 포인트',
                  expiresAt: rewardExpiresAt(new Date()),
                },
              }),
              prisma.user.update({
                where: { id: user.id },
                data: { pointBalance: { increment: SIGNUP_POINTS } },
              }),
            ]);
          } catch (error) {
            console.error('[auth] 가입 포인트 지급 실패', user.id, error);
          }
        },
      },
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
