import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 문서가 코드와 다른 말을 하지 않는다.
 *
 * **읽는 사람이 가장 먼저 보는 문서이고, 아무도 안 고친다.** 실제로 함수를
 * 서울(`icn1`)에서 싱가포르(`sin1`)로 옮기면서 `vercel.json` 과 배포 문서는
 * 고쳤는데 README 만 옛 값으로 남아 있었다 — 읽는 사람은 세 곳 중 어느 것을
 * 믿어야 하는지 알 수 없다.
 *
 * **틀리면 바로 아는 것만 건다.** 코드에서 그대로 뽑아낼 수 있는 사실
 * (리전·명세 파일 수)만 본다. 검사 개수처럼 돌려 봐야 아는 값은 여기서
 * 지키지 않는다 — 그것까지 걸면 이 검사가 전체 검사를 한 번 더 돌려야 한다.
 */

const ROOT = join(process.cwd(), '..', '..');
const README = readFileSync(join(ROOT, 'README.md'), 'utf8');
const DEPLOY = readFileSync(join(ROOT, 'docs/DEPLOY.md'), 'utf8');

describe('README 가 코드와 같은 말을 한다', () => {
  it('README 를 실제로 읽었다 — 못 읽으면 아래가 전부 헛돈다', () => {
    expect(README.length).toBeGreaterThan(5_000);
    expect(README).toContain('## 배포');
  });

  it('배포 리전이 vercel.json 과 같다', () => {
    const vercel = JSON.parse(
      readFileSync(join(process.cwd(), 'vercel.json'), 'utf8'),
    ) as { regions?: string[] };
    const region = vercel.regions?.[0];
    expect(region, 'vercel.json 에 regions 가 없다').toBeDefined();

    /*
     * 다른 리전 이름이 README 에 남아 있으면 안 된다. "sin1 으로 옮겼다" 고
     * 적어 두고 아래에서 `icn1` 을 권하는 식으로 어긋나는 것을 잡는다.
     */
    const mentioned = [...README.matchAll(/`((?:icn|sin|hnd|iad|sfo|fra|cdg|syd)\d)`/g)].map(
      (m) => m[1],
    );
    expect(mentioned.length, 'README 가 리전을 한 번도 안 적는다').toBeGreaterThan(0);
    expect(new Set(mentioned), `README 가 ${region} 아닌 리전을 말한다`).toEqual(
      new Set([region]),
    );
  });

  it('e2e 명세 파일 수가 실제와 같다', () => {
    const specs = readdirSync(join(process.cwd(), 'e2e')).filter((n) => n.endsWith('.spec.ts'));

    const hit = /e2e [\d,]+ \(Playwright, (\d+) 파일\)/.exec(README);
    expect(hit, 'README 에서 e2e 파일 수를 적은 자리를 못 찾았다').not.toBeNull();
    expect(Number(hit![1]), 'README 의 e2e 파일 수가 실제와 다르다').toBe(specs.length);
  });

  it('구조 표에 적은 패키지가 전부 실재한다', () => {
    /*
     * 패키지를 지우거나 이름을 바꿔도 README 의 나무 그림은 그대로 남는다.
     * 없는 폴더를 가리키는 그림은 읽는 사람을 헤매게 만든다.
     */
    const listed = [...README.matchAll(/^ {2}([a-z-]+)\/ {2,}/gm)].map((m) => m[1]!);
    expect(listed.length, 'README 의 구조 표를 못 읽었다').toBeGreaterThan(5);

    const real = new Set(readdirSync(join(ROOT, 'packages')));
    for (const name of listed) {
      if (name === 'web' || name === 'mobile') continue; // apps/ 아래다
      expect(real.has(name), `README 가 없는 패키지 ${name} 을 가리킨다`).toBe(true);
    }
  });
});

describe('배포 문서가 코드와 같은 말을 한다', () => {
  it('DEPLOY.md 를 실제로 읽었다', () => {
    expect(DEPLOY.length).toBeGreaterThan(3_000);
    expect(DEPLOY).toContain('pnpm db:seed');
  });

  it('운영 DB 시드 명령에 문지기 플래그가 들어 있다', () => {
    /*
     * **따라 할 수 없는 지시는 없는 것보다 나쁘다.** 시드는 원격 DB 를
     * 가리키면 플래그 없이는 거절한다 — 셸에 운영 주소를 남겨 둔 채 다른
     * 명령을 돌리는 실수를 막으려고 일부러 둔 문지기다. 그런데 문서에 적힌
     * 명령에는 그 플래그가 빠져 있었고, 그대로 따라 하면 멈췄다.
     *
     * 플래그 이름은 코드에서 가져온다. 이름을 바꾸면 여기서 걸린다.
     */
    const target = readFileSync(
      join(ROOT, 'packages/db/src/seed-target.ts'),
      'utf8',
    );
    const flag = /SEED_REMOTE_FLAG = '([A-Z_]+)'/.exec(target)?.[1];
    expect(flag, 'seed-target.ts 에서 플래그 이름을 못 찾았다').toBeDefined();

    const line = DEPLOY.split('\n').find((l) => l.includes('pnpm db:seed') && l.includes('DATABASE_URL'));
    expect(line, 'DEPLOY.md 에서 운영 시드 명령을 못 찾았다').toBeDefined();
    expect(line, `그대로 따라 하면 ${flag} 가 없어 거절당한다`).toContain(`${flag}=yes`);
  });
});
