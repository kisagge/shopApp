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
    // 마이그레이션·introspection 용. 런타임 클라이언트는 어댑터로 따로 연결한다.
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'tsx src/seed.ts',
  },
});
