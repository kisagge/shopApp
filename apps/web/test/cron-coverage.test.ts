import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 배치가 인증을 걸고, **실제로 돌도록 등록돼 있는지** 지킨다.
 *
 * 등록을 빠뜨리는 것은 조용히 지나가는 실수다. 라우트는 멀쩡히 있고
 * 테스트도 통과하는데 아무도 부르지 않아서, 배포한 뒤 몇 주가 지나서야
 * "왜 안 돌지" 가 된다. 결제 대기 주문을 푸는 배치가 그렇게 잠들면
 * **재고가 계속 묶인다** — 이 배치를 만든 이유가 그것이다.
 *
 * 요청 제한과 캐시 무효화를 목록으로 지킨 것과 같은 자리다.
 */

const CRON_DIR = join(process.cwd(), 'src', 'app', 'api', 'cron');
const routes = readdirSync(CRON_DIR).filter((name) => !name.startsWith('.'));

const vercel = JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as {
  crons?: { path: string; schedule: string }[];
};
const scheduled = new Map((vercel.crons ?? []).map((c) => [c.path, c.schedule]));

describe('배치', () => {
  it('하나 이상 있다 — 목록이 비면 아래 검사가 전부 헛돈다', () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it.each(routes)('%s 가 인증을 건다', (name) => {
    const source = readFileSync(join(CRON_DIR, name, 'route.ts'), 'utf8');
    expect(source).toContain('authorizeCron');
  });

  it.each(routes)('%s 가 vercel.json 에 등록돼 있다', (name) => {
    expect(scheduled.has(`/api/cron/${name}`)).toBe(true);
  });

  it('등록된 배치는 전부 실제로 있다 — 지운 뒤 남은 줄은 매일 404 를 부른다', () => {
    const known = new Set(routes.map((name) => `/api/cron/${name}`));
    expect([...scheduled.keys()].filter((path) => !known.has(path))).toEqual([]);
  });

  it.each([...scheduled])('%s 의 주기가 크론 표현식이다', (_path, schedule) => {
    expect(schedule.trim().split(/\s+/)).toHaveLength(5);
  });
});
