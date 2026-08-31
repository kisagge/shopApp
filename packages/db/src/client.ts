import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

/**
 * Prisma 7은 드라이버 어댑터로 연결한다.
 *
 * 서버리스(Vercel)에서는 함수 인스턴스마다 커넥션을 새로 열기 때문에
 * 일반 Postgres에 직접 붙이면 커넥션이 금방 고갈된다.
 * DATABASE_URL 은 반드시 **풀러를 거친 주소**여야 한다
 * (Neon pooled endpoint, Supabase pgbouncer, Prisma Accelerate 등).
 */
function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL 이 설정되지 않았습니다. .env 를 확인하세요.');
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// 개발 중 HMR이 돌 때마다 클라이언트를 새로 만들면 커넥션이 쌓인다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
