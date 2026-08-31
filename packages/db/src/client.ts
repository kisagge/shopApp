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
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

// 개발 중 HMR이 돌 때마다 클라이언트를 새로 만들면 커넥션이 쌓인다.
const globalForPrisma = globalThis as unknown as { __shopPrisma?: PrismaClient };

/**
 * 모듈을 불러오는 시점이 아니라 **처음 쓰는 시점**에 연결을 만든다.
 *
 * 이유가 두 가지다.
 * 1) ESM은 import 를 본문보다 먼저 평가한다. 모듈 최상단에서 클라이언트를
 *    만들면 dotenv 로 .env 를 읽기도 전에 DATABASE_URL 을 찾게 된다.
 * 2) CI와 Vercel 빌드는 DB 없이 돈다. import 만으로 던지면 DB를 전혀 건드리지
 *    않는 페이지의 빌드까지 같이 죽는다.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    globalForPrisma.__shopPrisma ??= createClient();
    const value = Reflect.get(globalForPrisma.__shopPrisma, prop, receiver);
    return typeof value === 'function' ? value.bind(globalForPrisma.__shopPrisma) : value;
  },
});
