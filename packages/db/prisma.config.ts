// Prisma 7부터 연결 URL과 마이그레이션 설정은 schema.prisma가 아니라 여기에 둔다.
import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    // 마이그레이션·introspection 용. 런타임 클라이언트는 어댑터로 따로 연결한다.
    url: process.env.DATABASE_URL ?? '',
  },
  migrations: {
    seed: 'node --experimental-strip-types src/seed.ts',
  },
});
