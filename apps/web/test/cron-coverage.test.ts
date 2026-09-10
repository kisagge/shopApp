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

/**
 * 함수 리전.
 *
 * **문서와 설정이 어긋난 채로 굳어 있었다.** DEPLOY.md 는 "리전은 icn1(서울)에
 * 맞춘다" 고 적었는데 Neon 에는 서울 리전이 없다 — 따를 수 없는 지시였다.
 * 그래서 DB 는 싱가포르에 놓이고 vercel.json 은 서울을 가리켰다. 아무 데도
 * 가깝지 않으면서 양쪽 거리를 다 치르는 상태다. 기기에서 재 보니 DB 왕복
 * 하나가 141ms 였고(질의 내용과 무관하게 고정), 주문 하나에 그 왕복을
 * 열 번 넘게 쓴다.
 *
 * 리전은 코드가 아니라 배포 설정이라 검사가 값을 확인할 수는 없다. 대신
 * **설정과 문서가 같은 곳을 가리키는지**를 본다 — 어긋나는 것이 문제였으므로
 * 어긋남을 잡는 것이 맞다.
 */
describe('함수 리전', () => {
  const region = (vercel as { regions?: string[] }).regions ?? [];

  it('한 곳으로 고정한다 — 비워 두면 배포마다 달라진다', () => {
    expect(region).toHaveLength(1);
  });

  /**
   * **이름이 문서 어딘가에 있는지만 보면 안 된다.** 옛 리전은 "예전에는 이랬다"
   * 는 설명으로 문서에 계속 남으므로, 그런 검사는 어느 리전이든 통과한다 —
   * 눈을 감고 통과하는 검사가 된다. 그래서 **지시 문장**이 어디를 가리키는지 본다.
   */
  it('DEPLOY.md 의 지시가 같은 곳을 가리킨다', () => {
    const doc = readFileSync(join(process.cwd(), '..', '..', 'docs', 'DEPLOY.md'), 'utf8');
    expect(doc, `vercel.json 은 ${region[0]} 인데 DEPLOY.md 는 그렇게 하라고 말하지 않는다`)
      .toMatch(new RegExp('`' + region[0] + '`[^\\n]{0,20}(에 맞춘다|으로 맞춘다|로 둔다|에 둔다)'));
  });

  /**
   * 다른 리전 이름이 문서에 남아 있으면 다음 사람이 그것을 따라간다 —
   * 실제로 `icn1` 이 그렇게 남아 지시가 됐다.
   */
  it('예전 리전 이름이 지시로 남아 있지 않다', () => {
    const doc = readFileSync(join(process.cwd(), '..', '..', 'docs', 'DEPLOY.md'), 'utf8');
    const others = ['icn1', 'iad1', 'hnd1', 'sin1'].filter((r) => r !== region[0]);
    for (const r of others) {
      // 옛일을 설명하는 문장에는 나올 수 있다. 지시로 읽히는 자리만 막는다
      expect(doc, `${r} 이 "맞춘다" 는 지시로 남아 있다`).not.toMatch(
        new RegExp(`\`${r}\`[^\n]{0,20}(에 맞춘다|으로 맞춘다|로 둔다)`),
      );
    }
  });
});

