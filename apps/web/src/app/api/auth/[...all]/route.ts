import { auth } from '@shop/auth';

/**
 * Better Auth 의 모든 엔드포인트(/api/auth/*)를 이 라우트가 받는다.
 *
 * 1.7.2 에는 better-auth/next-js 서브패스가 없다. auth.handler 자체가
 * (Request) => Promise<Response> 라 App Router 핸들러로 그대로 쓸 수 있다.
 */
export const GET = auth.handler;
export const POST = auth.handler;
