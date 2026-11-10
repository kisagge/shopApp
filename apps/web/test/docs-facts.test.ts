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
 * (리전·명세 파일 수·의존성 판)만 본다. 검사 개수처럼 돌려 봐야 아는 값은 여기서
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

/** manifest 에서 판을 읽는다. 캐럿·물결은 적는 자리의 문법이라 떼어 낸다. */
function manifest(rel: string): {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  packageManager?: string;
} {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) as ReturnType<typeof manifest>;
}

function dep(rel: string, key: string): string {
  const m = manifest(rel);
  return (m.dependencies?.[key] ?? m.devDependencies?.[key] ?? '').replace(/^[\^~]/, '');
}

/**
 * 스택 줄의 이름마다 **어느 manifest 의 어느 열쇠**인지.
 *
 * 판 자체는 적지 않는다 — 적으면 README 와 같이 낡는다. 여기 적는 것은
 * "어디서 읽을지" 뿐이다.
 */
const STACK: Record<string, () => string> = {
  Next: () => dep('apps/web/package.json', 'next'),
  React: () => dep('apps/web/package.json', 'react'),
  TypeScript: () => dep('apps/web/package.json', 'typescript'),
  Prisma: () => dep('packages/db/package.json', 'prisma'),
  Zod: () => dep('packages/contract/package.json', 'zod'),
  Tailwind: () => dep('apps/web/package.json', 'tailwindcss'),
  Zustand: () => dep('apps/web/package.json', 'zustand'),
  Capacitor: () => dep('apps/mobile/package.json', '@capacitor/core'),
  Node: () => readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim().replace(/^v/, ''),
  pnpm: () => (manifest('package.json').packageManager ?? '').replace(/^pnpm@/, ''),
};

/*
 * 스택 줄을 뽑는다. 줄바꿈이 중간에 있어도 가름은 `·` 하나라서 그걸로 나눈다.
 */
const STACK_ENTRIES: [string, string][] = (
  README.split('\n\n').find((block) => block.startsWith('Next ')) ?? ''
)
  .split('·')
  .map((piece) => /^(\S+) (\d[\d.]*)$/.exec(piece.trim()))
  .filter((hit): hit is RegExpExecArray => hit !== null)
  .map((hit) => [hit[1]!, hit[2]!]);

describe('README 의 스택 줄이 manifest 와 같은 판을 말한다', () => {
  /*
   * **이 줄이 한 번 조용히 흘렀다.** next 를 16.3.8 → 16.4.5(보안 판)로,
   * react 를 19.2.8 → 19.3.1 로 올리면서 manifest 와 잠금 파일은 고쳤는데
   * README 는 한 판 낡은 번호를 계속 적고 있었다. 리전과 같은 모양이다 —
   * 어디서 보느냐에 따라 답이 다르고, 아무도 이 줄을 안 본다.
   *
   * 적는 자리마다 자릿수가 다른 것은 뜻이 있다(`Next 16.4.5` 는 보안 판까지
   * 밝히고, `Zod 4` 는 큰 자리만 말한다). 그래서 **점 경계의 앞자리**로 본다 —
   * `Prisma 7` 은 `7.10.1` 과 맞고, `Prisma 7.9` 는 안 맞는다.
   */
  it('스택 줄을 찾아 읽었다 — 못 읽으면 아래 전수가 헛돈다', () => {
    expect(STACK_ENTRIES.length, 'README 에서 스택 줄을 못 찾았다').toBeGreaterThanOrEqual(10);
  });

  it('표에 적은 이름과 줄에 적은 이름이 같다', () => {
    /*
     * 양쪽으로 본다. 줄에 이름을 더하면 읽을 자리를 표에 적게 만들고,
     * 줄에서 이름을 지우면 **검사가 조용히 사라지는 것**을 막는다.
     */
    expect(new Set(STACK_ENTRIES.map(([name]) => name))).toEqual(new Set(Object.keys(STACK)));
  });

  it.each(STACK_ENTRIES)('%s %s 가 manifest 의 판과 같다', (name, written) => {
    const real = STACK[name]!();
    expect(real, `${name} 의 판을 manifest 에서 못 읽었다`).not.toBe('');
    expect(
      real === written || real.startsWith(`${written}.`),
      `README 는 ${name} ${written} 이라고 적는데 실제는 ${real} 이다`,
    ).toBe(true);
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
