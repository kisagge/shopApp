import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * **`pnpm outdated` 가 권하는 prisma 판을 그대로 받으면 안 된다.**
 *
 * npm 의 `latest` 꼬리표가 `prisma` 에서는 **미리보기**를 가리키고 있다 —
 * `prisma` 의 `latest` 가 `8.0.0-rc.28` 이고 안정판은 `prev` 에 밀려 있다
 * (`prev = 7.10.1`). 그런데 `@prisma/client` 의 `latest` 는 안정판 `7.10.1` 이다.
 * 그래서 `outdated` 는 **"prisma 7.10.1 → 8.0.0-rc.28" 한 줄만** 띄운다 —
 * 클라이언트는 밀린 데가 없다고 말하면서.
 *
 * 그 한 줄을 받으면 **CLI 8 과 클라이언트 7 로 갈라진다.** 갈라진 자리가
 * 하필 운영 배포 경로다 — Vercel 의 buildCommand 가 `prisma migrate deploy` 를
 * 그 CLI 로 돌리고, 돌아간 뒤에 남는 것은 되돌리기 어려운 스키마 변경이다.
 * 드라이버 어댑터(`@prisma/adapter-pg`)도 클라이언트와 같은 판을 요구한다.
 *
 * 타입스크립트 7 과 같은 모양이고 같은 식으로 막는다(`typescript-range.test.ts`) —
 * 까닭을 글로만 적어 두면 `outdated` 는 다음에도 같은 줄을 띄우고, 그때 받는
 * 사람은 왜 안 되는지 모른다. 판을 **읽어서 견주므로** 안정판 8 이 나오는 날
 * 올리는 것은 막지 않는다 — 막는 것은 미리보기와 **짝이 갈라지는 것**이다.
 */

const ROOT = join(import.meta.dirname, '..', '..', '..');

type Manifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

/** `pnpm-workspace.yaml` 의 `packages:` glob — 꾸러미 목록을 손으로 적지 않는다 */
function workspaceGlobs(): string[] {
  const yaml = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\n((?:\s*-\s*.+\n)+)/m.exec(yaml);
  expect(block, 'pnpm-workspace.yaml 에서 packages 목록을 못 찾았다').not.toBeNull();
  return [...block![1]!.matchAll(/-\s*'?([^'\s]+)'?/g)].map((m) => m[1]!);
}

/** glob 이 가리키는 자리 + 뿌리 */
function manifestDirs(): string[] {
  const out = ['.'];
  for (const glob of workspaceGlobs()) {
    const base = glob.replace(/\/\*$/, '');
    for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true })) {
      if (entry.isDirectory()) out.push(`${base}/${entry.name}`);
    }
  }
  return out;
}

type Spec = { dir: string; name: string; version: string };

/** 워크스페이스 전체에서 선언한 prisma 조각들 */
function prismaSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const dir of manifestDirs()) {
    const file = join(ROOT, dir, 'package.json');
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    for (const deps of [manifest.dependencies, manifest.devDependencies]) {
      for (const [name, version] of Object.entries(deps ?? {})) {
        if (name === 'prisma' || name.startsWith('@prisma/')) out.push({ dir, name, version });
      }
    }
  }
  return out;
}

const SPECS = prismaSpecs();
const label = (s: Spec) => `${s.dir} ${s.name}@${s.version}`;

describe('prisma 판', () => {
  it('선언한 자리를 실제로 찾는다', () => {
    /*
     * **그물이 헛돌지 않는지 먼저 본다.** 아래 두 검사는 찾은 것이 하나도 없으면
     * 통째로 통과한다 — 꾸러미를 옮기거나 이름을 바꾸면 그렇게 눈이 먼다.
     * 막으려는 짝 둘이 보이는지 여기서 못 박는다.
     */
    const names = SPECS.map((s) => s.name);
    expect(names, 'prisma CLI 선언을 못 찾았다').toContain('prisma');
    expect(names, '@prisma/client 선언을 못 찾았다').toContain('@prisma/client');
  });

  it('CLI·클라이언트·어댑터가 한 판이다', () => {
    /*
     * CLI 만 올리는 것이 가장 받기 쉬운 권유인데(위 주석), 그러면 마이그레이션을
     * 돌리는 쪽과 질의를 만드는 쪽이 다른 판이 된다.
     */
    const versions = [...new Set(SPECS.map((s) => s.version))];
    expect(versions, `prisma 조각의 판이 갈렸다 — ${SPECS.map(label).join(', ')}`).toHaveLength(1);
  });

  it.each(SPECS.map((s) => [label(s), s] as const))('%s — 미리보기 판이 아니다', (_name, spec) => {
    /*
     * semver 에서 `-` 뒤는 모두 미리보기다(`-rc`·`-dev`·`-integration` …).
     * prisma 는 그것을 `latest` 로 내보내고 있어 `outdated` 와 `npm i prisma@latest`
     * 둘 다 그리로 데려간다.
     */
    expect(
      spec.version,
      `${spec.name} 이 미리보기 판이다("${spec.version}"). ` +
        'prisma 는 미리보기를 latest 로 내보내므로 outdated 의 권유를 그대로 받으면 여기에 닿는다 — ' +
        '안정판이 나온 뒤에 올린다',
    ).not.toMatch(/-/);
  });

  it.each(SPECS.map((s) => [label(s), s] as const))('%s — 깔린 판이 선언과 같다', (_name, spec) => {
    /*
     * 적은 것과 깔린 것이 어긋나는 길이 둘 있다 — package.json 만 고치고 설치를
     * 안 한 채로 커밋하거나, overrides 가 조용히 다른 판을 끼우거나.
     * 둘 다 `prisma generate` 가 만드는 클라이언트와 CLI 를 갈라 놓는다.
     */
    const file = join(ROOT, spec.dir, 'node_modules', spec.name, 'package.json');
    expect(existsSync(file), `${spec.name} 이 ${spec.dir} 에 깔려 있지 않다 — pnpm install 을 돌린다`).toBe(true);
    const installed = (JSON.parse(readFileSync(file, 'utf8')) as { version: string }).version;
    expect(installed, `${spec.name} — 적은 것은 ${spec.version}, 깔린 것은 ${installed}`).toBe(spec.version);
  });
});
