// Prisma 7부터 연결 URL과 마이그레이션 설정은 schema.prisma가 아니라 여기에 둔다.
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { defineConfig } from 'prisma/config';

// dotenv 는 기본적으로 cwd 에서 .env 를 찾는다. 모노레포라 실행 위치가
// packages/db 이므로 루트를 명시해야 한다.
config({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    /**
     * 마이그레이션·introspection 용. 런타임 클라이언트는 어댑터로 따로 연결한다.
     *
     * **풀러를 거치지 않은 주소를 쓴다.** 서버리스용 커넥션 풀러(PgBouncer 등)는
     * 트랜잭션 모드에서 DDL 과 어드바이저리 락을 제대로 다루지 못해 마이그레이션이
     * 중간에 멈춘다.
     *
     * DATABASE_URL_UNPOOLED 는 Neon 의 Vercel 통합이 자동으로 넣어 주는 이름이다.
     * 이 이름을 함께 받으면 **비밀번호가 든 URL 을 손으로 옮겨 적을 일이 없다.**
     * 마지막 폴백은 로컬용 — 도커 Postgres 에는 풀러가 없다.
     */
    // ?? 가 아니라 || 를 쓴다. 빈 문자열도 "없음" 으로 봐야 한다 —
    // .env 에 DIRECT_DATABASE_URL="" 처럼 자리만 잡아 둔 경우가 흔하고,
    // ?? 는 그 빈 값을 그대로 통과시켜 연결 주소가 비어 버린다.
    url:
      process.env.DIRECT_DATABASE_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.DATABASE_URL ||
      '',
    /**
     * 섀도 DB — 마이그레이션 이력이 실제로 무엇을 만들어 내는지 검사할 때
     * Prisma 가 임시로 쓰고 지우는 빈 데이터베이스다.
     *
     * 개발 DB 를 그대로 쓰면 검사 도중 데이터가 날아간다. 반드시 별도
     * 데이터베이스를 가리켜야 하고, **배포 환경에는 필요 없다**
     * (migrate deploy 는 섀도 DB 를 쓰지 않는다).
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'tsx src/seed.ts',
  },
});
