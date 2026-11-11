import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

/**
 * 꾸러미가 쓰는 것을 적어 두었는지 본다.
 *
 * **`@shop/contract` 는 `@shop/core` 를 `devDependencies` 에만 적어 두고 값으로 쓰고 있었다.**
 * 상수와 열거형을 26개 파일이 들여온다(`MAX_QUANTITY`, `ORDER_STATUS` …). 지금 깨지지 않는
 * 까닭은 하나뿐이다 — 유일한 소비자인 `apps/web` 이 자기 `dependencies` 에 같은 꾸러미를
 * 적어 두었고, pnpm 이 워크스페이스 설치에서는 개발 의존까지 다 걸어 주기 때문이다.
 * 그 둘 중 하나만 바뀌면(개발 의존을 걷어 낸 설치, core 를 안 적은 다른 소비자) 입구가
 * 풀리지 않는다. 같은 것을 런타임으로 쓰는 `ui`·`auth`·`db`·`web` 넷은 모두
 * `dependencies` 에 적었다 — contract 만 달랐다.
 *
 * **면제를 손으로 적지 않는다.** `auth`·`db` 의 `dotenv` 는 `devDependencies` 가 옳다 —
 * 씨앗 스크립트(`pnpm seed`)만 쓰고, 꾸러미 입구에서는 닿지 않는다. 그 사실을 믿는 대신
 * `exports` 에서 상대 import 와 재수출을 따라가 **닿는 파일의 집합을 세어서** 증명한다.
 * 입구에서 닿으면 런타임이고, 닿지 않으면 개발용이다.
 *
 * 꾸러미 목록도 손으로 적지 않는다 — `pnpm-workspace.yaml` 의 glob 으로 센다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');

type Manifest = {
  name?: string;
  main?: string;
  exports?: Record<string, string> | string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/** `pnpm-workspace.yaml` 의 `packages:` glob — `apps/*`, `packages/*` */
function workspaceGlobs(): string[] {
  const yaml = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const block = /^packages:\n((?:\s*-\s*.+\n)+)/m.exec(yaml);
  expect(block, 'pnpm-workspace.yaml 에서 packages 목록을 못 찾았다').not.toBeNull();
  return [...block![1]!.matchAll(/-\s*'?([^'\s]+)'?/g)].map((m) => m[1]!);
}

/** glob 이 가리키는 자리마다 package.json 이 있는 곳을 모은다 */
function workspacePackages(): { dir: string; manifest: Manifest }[] {
  const out: { dir: string; manifest: Manifest }[] = [];
  for (const glob of workspaceGlobs()) {
    const base = glob.replace(/\/\*$/, '');
    for (const entry of readdirSync(join(ROOT, base), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = `${base}/${entry.name}`;
      const file = join(ROOT, dir, 'package.json');
      if (!existsSync(file)) continue;
      out.push({ dir, manifest: JSON.parse(readFileSync(file, 'utf8')) as Manifest });
    }
  }
  return out;
}

const PACKAGES = workspacePackages();

/** `.ts`/`.tsx` 를 모두 긁는다 — 손 목록은 늘 늦게 자란다 */
function sourceFiles(dir: string): string[] {
  const root = join(ROOT, dir, 'src');
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
  };
  walk(root);
  return out;
}

type Spec = { spec: string; typeOnly: boolean };

/**
 * 한 파일이 들여오는 것들.
 *
 * 재수출(`export … from`)도 센다 — 통짜 입구(`index.ts`)는 거의 재수출뿐이라,
 * 그것을 빼면 입구에서 닿는 것이 하나도 없다고 읽힌다.
 */
function specsOf(source: string): Spec[] {
  const out: Spec[] = [];
  // import x from 'y' / import { a, type b } from 'y' / export … from 'y'
  /*
   * 들여오는 문장만 집는다. 처음에는 가운데를 `[\s\S]*?` 로 열어 두었는데, 그것이
   * `import` 한참 아래의 `to: pick(` 같은 코드까지 한 문장으로 삼켜서 꾸러미 이름이
   * `") ?? undefined,\n  to: url` 로 나왔다 — 그물이 자기가 지어낸 이름으로 졌다.
   * 따옴표와 쌍반점은 문장이 이미 끝났다는 표시라, 가운데에서 뺀다.
   */
  for (const m of source.matchAll(/^[ \t]*(?:import|export)\s+(type\s+)?([^;'"]*?)\sfrom\s*'([^']+)'/gm)) {
    const clause = m[2] ?? '';
    // `import { type A, type B }` 는 값을 안 가져온다 — `{ type A, B }` 는 가져온다
    const onlyTypeSpecifiers =
      /^\{[\s\S]*\}$/.test(clause.trim()) &&
      clause
        .replace(/[{}]/g, '')
        .split(',')
        .filter((s) => s.trim() !== '')
        .every((s) => /^\s*type\s/.test(s));
    out.push({ spec: m[3]!, typeOnly: Boolean(m[1]) || onlyTypeSpecifiers });
  }
  // import 'y' — 값은 안 받지만 그 꾸러미를 실행한다
  for (const m of source.matchAll(/^\s*import\s*'([^']+)'/gm)) {
    out.push({ spec: m[1]!, typeOnly: false });
  }
  return out;
}

/** `@scope/name/deep` 와 `name/deep` 에서 꾸러미 이름만 */
function packageName(spec: string): string {
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

const isRelative = (spec: string): boolean => spec.startsWith('.');
const isBuiltin = (spec: string): boolean => spec.startsWith('node:');

/** 상대 경로를 실제 파일로 — 확장자 없이 적고, 폴더면 index 를 쓴다 */
function resolveRelative(fromFile: string, spec: string): string | null {
  const base = resolve(dirname(fromFile), spec);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

/** `exports`·`main` 이 가리키는 `.ts` 입구들 */
function entryFiles(pkg: { dir: string; manifest: Manifest }): string[] {
  const { exports: ex, main } = pkg.manifest;
  const raw = [
    ...(typeof ex === 'string' ? [ex] : Object.values(ex ?? {})),
    ...(main ? [main] : []),
  ];
  return [...new Set(raw.filter((p) => /\.tsx?$/.test(p)).map((p) => join(ROOT, pkg.dir, p)))];
}

/**
 * 입구에서 걸어서 닿는 파일들.
 *
 * 입구를 안 적은 꾸러미(Next 앱)는 파일 하나하나가 입구다 — 전부 런타임으로 본다.
 */
function reachableFiles(pkg: { dir: string; manifest: Manifest }): Set<string> {
  const entries = entryFiles(pkg);
  if (entries.length === 0) return new Set(sourceFiles(pkg.dir));

  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const { spec } of specsOf(readFileSync(file, 'utf8'))) {
      if (!isRelative(spec)) continue;
      const next = resolveRelative(file, spec);
      if (next !== null) queue.push(next);
    }
  }
  return seen;
}

/** 소스를 가진 꾸러미만 본다 — `@shop/config` 는 tsconfig·eslint 조각뿐이다 */
const WITH_SOURCE = PACKAGES.filter((p) => sourceFiles(p.dir).length > 0);

describe('꾸러미 선언', () => {
  it('꾸러미 목록을 손으로 적지 않는다', () => {
    // glob 으로 세므로 새 꾸러미는 다음 검사들에 저절로 끌려 들어온다
    expect(workspaceGlobs()).toEqual(['apps/*', 'packages/*']);
    expect(PACKAGES.map((p) => p.dir)).toContain('packages/contract');
    expect(WITH_SOURCE.length).toBeGreaterThanOrEqual(8);
  });

  it.each(WITH_SOURCE.map((p) => [p.dir, p] as const))(
    '%s — 입구에서 쓰는 꾸러미를 dependencies 에 적는다',
    (dir, pkg) => {
      const declared = new Set([
        ...Object.keys(pkg.manifest.dependencies ?? {}),
        // 소비자가 넣어 주기로 한 것도 선언이다 (ui 의 react)
        ...Object.keys(pkg.manifest.peerDependencies ?? {}),
      ]);
      const reachable = reachableFiles(pkg);

      // 한 꾸러미를 스물여섯 곳이 들여오면 스물여섯 줄이 아니라 한 줄로 말한다
      const missing = new Map<string, string[]>();
      for (const file of [...reachable].sort()) {
        for (const { spec, typeOnly } of specsOf(readFileSync(file, 'utf8'))) {
          if (typeOnly || isRelative(spec) || isBuiltin(spec) || spec.startsWith('~')) continue;
          const name = packageName(spec);
          if (declared.has(name)) continue;
          const where = missing.get(name) ?? [];
          if (!where.includes(file)) where.push(file);
          missing.set(name, where);
        }
      }

      expect(
        [...missing]
          .map(([name, where]) => `${name} — ${where.length}곳, 예: ${where[0]!.slice(ROOT.length + 1)}`)
          .sort(),
        `${dir} 가 값으로 쓰는데 dependencies 에 없다 — 개발 의존을 걷어 낸 설치에서 입구가 풀리지 않는다`,
      ).toEqual([]);
    },
  );

  it.each(WITH_SOURCE.map((p) => [p.dir, p] as const))(
    '%s — 들여오는 꾸러미를 어디엔가는 적는다',
    (dir, pkg) => {
      const declared = new Set([
        ...Object.keys(pkg.manifest.dependencies ?? {}),
        ...Object.keys(pkg.manifest.devDependencies ?? {}),
        ...Object.keys(pkg.manifest.peerDependencies ?? {}),
      ]);

      const missing = new Set<string>();
      for (const file of sourceFiles(pkg.dir)) {
        for (const { spec } of specsOf(readFileSync(file, 'utf8'))) {
          if (isRelative(spec) || isBuiltin(spec) || spec.startsWith('~')) continue;
          const name = packageName(spec);
          if (!declared.has(name)) missing.add(name);
        }
      }

      expect([...missing].sort(), `${dir} 가 적지 않은 꾸러미를 들여온다`).toEqual([]);
    },
  );

  it('워크스페이스끼리는 workspace:* 로 가리킨다', () => {
    const names = new Set(PACKAGES.map((p) => p.manifest.name).filter((n): n is string => Boolean(n)));
    const wrong: string[] = [];
    for (const pkg of PACKAGES) {
      const all = {
        ...(pkg.manifest.dependencies ?? {}),
        ...(pkg.manifest.devDependencies ?? {}),
      };
      for (const [name, range] of Object.entries(all)) {
        // 판을 박아 두면 고친 쪽과 쓰는 쪽이 갈린다 — 한 저장소 안에서는 늘 지금 것을 쓴다
        if (names.has(name) && range !== 'workspace:*') wrong.push(`${pkg.dir}: ${name}=${range}`);
      }
    }
    expect(wrong.sort()).toEqual([]);
  });

  /**
   * **설치하는 못은 정확한 판이다.**
   *
   * 이 저장소에 캐럿이 넷 남아 있었고, 그중 하나가 `@playwright/test` 였다 —
   * **검사가 보는 동작을 정하는 꾸러미**다. 그 판의 깨지는 변경이 열 개였는데
   * (동작이 inert 아님을 기다린다, 접근 이름에서 안 그려진 글자를 뺀다 …)
   * 캐럿을 둔 채로는 그것이 **커밋 없이, 아무 설명 없이** 들어온다. 어느 날
   * 다른 기계에서 e2e 가 지면 무엇이 달라졌는지 아무 기록이 없다.
   *
   * 정확한 판은 "올리는 일" 을 커밋 하나로 만든다 — 그 커밋에 무엇을 세어
   * 보았는지 적을 수 있다.
   *
   * **짝 선언(peerDependencies)은 뺀다.** 그것은 설치 선택이 아니라 "이 판대로
   * 넣어 주면 된다" 는 호환 선언이라, 범위가 맞다(`ui` 의 `react ^19.0.0`).
   * 그래서 그 칸이 실제로 있다는 것도 함께 본다 — 없어지면 이 면제가 헛돈다.
   *
   * 범위를 둬야 할 꾸러미가 생기면 여기에 까닭을 적은 면제 표를 만든다. 지금은
   * 하나도 없어서 표를 두지 않는다 — 빈 표는 지키는 것이 없다.
   */
  const EXACT = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

  it.each(PACKAGES.map((p) => [p.dir, p] as const))('%s — 설치하는 못이 정확한 판이다', (dir, pkg) => {
    const loose: string[] = [];
    for (const field of ['dependencies', 'devDependencies'] as const) {
      for (const [name, range] of Object.entries(pkg.manifest[field] ?? {})) {
        // 워크스페이스끼리는 늘 지금 것을 쓴다 — 위의 검사가 그쪽을 본다
        if (range === 'workspace:*') continue;
        if (!EXACT.test(range)) loose.push(`${field}.${name}=${range}`);
      }
    }
    expect(
      loose.sort(),
      `${dir} 의 못이 느슨하다 — 올리는 일이 커밋 없이 일어난다`,
    ).toEqual([]);
  });

  it('짝 선언은 범위다 — 뺀 까닭이 실재한다', () => {
    const peers = PACKAGES.flatMap((p) =>
      Object.entries(p.manifest.peerDependencies ?? {}).map(([name, range]) => `${p.dir}: ${name}=${range}`),
    );
    expect(peers.length, '짝 선언이 하나도 없다 — 위 검사의 면제가 지키는 것이 없다').toBeGreaterThan(0);
    expect(peers.some((p) => !EXACT.test(p.split('=')[1]!)), '짝 선언이 전부 정확한 판이다').toBe(true);
  });

  /**
   * **선언한 node 하한이 의존성이 요구하는 것보다 낮지 않다.**
   *
   * jsdom 31 을 올리는 날 드러난 자리다. 그쪽이 `^22.22.2 || ^24.15.0 || >=26.0.0`
   * 을 요구하는데 이 저장소는 `>=24.0.0` 이라고 적고 있었다 — **24.0~24.14 를 쓰는
   * 사람에게는 틀린 안내다.** `engine-strict` 를 안 켜 두었으니 설치가 막아 주지도
   * 않는다. 문지기는 `.nvmrc`(24.20.0)로 돌아서 영영 모른다.
   *
   * 수를 손으로 적지 않는다 — **깔린 꾸러미의 `engines` 에서 끌어낸다.** 올리는
   * 사람이 하한을 올려야 하는 날 여기서 걸린다.
   *
   * **node 24 계열만 읽는다.** 이 저장소는 24 로 고정이고(`.nvmrc`), 범위에 적힌
   * 다른 계열(`^22`·`>=26`)은 여기서 쓸 일이 없다. 그 전제가 깨지면(nvmrc 가 24 가
   * 아니게 되면) **읽는 법을 고치라고** 아래에서 진다.
   */
  type Floor = [number, number, number];

  /** `^24.15.0`·`>=24.0` 같은 조각에서 24 계열 하한을 모아 가장 높은 것 */
  function node24Floor(range: string): Floor | null {
    let best: Floor | null = null;
    for (const m of range.matchAll(/(?:\^|>=\s*)24(?:\.(\d+))?(?:\.(\d+))?/g)) {
      const found: Floor = [24, Number(m[1] ?? 0), Number(m[2] ?? 0)];
      if (best === null || found[1] > best[1] || (found[1] === best[1] && found[2] > best[2])) {
        best = found;
      }
    }
    return best;
  }

  /** 직접 적어 둔 꾸러미들이 깔린 자리에서 말하는 node 범위 */
  function declaredEngines(): { name: string; range: string }[] {
    const out = new Map<string, string>();
    for (const pkg of PACKAGES) {
      const deps = { ...(pkg.manifest.dependencies ?? {}), ...(pkg.manifest.devDependencies ?? {}) };
      for (const [name, range] of Object.entries(deps)) {
        if (range === 'workspace:*' || out.has(name)) continue;
        for (const base of [join(ROOT, pkg.dir, 'node_modules'), join(ROOT, 'node_modules')]) {
          const file = join(base, name, 'package.json');
          if (!existsSync(file)) continue;
          const engines = (JSON.parse(readFileSync(file, 'utf8')) as { engines?: { node?: string } }).engines;
          if (engines?.node) out.set(name, engines.node);
          break;
        }
      }
    }
    return [...out].map(([name, range]) => ({ name, range }));
  }

  it('node 하한을 의존성에서 끌어내 견준다', () => {
    const nvmrc = readFileSync(join(ROOT, '.nvmrc'), 'utf8').trim();
    expect(
      nvmrc.startsWith('24.'),
      `.nvmrc 가 ${nvmrc} 다 — 24 계열만 읽는 이 검사의 읽는 법을 함께 고친다`,
    ).toBe(true);

    const root = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
      engines?: { node?: string };
    };
    const declared = /^>=\s*(\d+)\.(\d+)\.(\d+)$/.exec(root.engines?.node ?? '');
    expect(
      declared,
      `뿌리의 engines.node 모양이 바뀌었다("${root.engines?.node}") — 읽는 법을 함께 고친다`,
    ).not.toBeNull();
    const ours: Floor = [Number(declared![1]), Number(declared![2]), Number(declared![3])];

    const engines = declaredEngines();
    expect(engines.length, 'engines 를 적은 꾸러미를 못 찾았다 — 이 검사가 헛돈다').toBeGreaterThan(10);

    const tooHigh = engines
      .map(({ name, range }) => ({ name, range, floor: node24Floor(range) }))
      .filter(({ floor }) => floor !== null)
      .filter(({ floor }) => floor![1] > ours[1] || (floor![1] === ours[1] && floor![2] > ours[2]))
      .map(({ name, range }) => `${name} — ${range}`);

    expect(
      tooHigh.sort(),
      `적어 둔 node ${ours.join('.')} 보다 높은 판을 요구하는 꾸러미가 있다 — 하한을 올린다`,
    ).toEqual([]);
  });

  it('씨앗 스크립트만 쓰는 것은 devDependencies 에 남는다', () => {
    /*
     * 면제의 증명이다. `dotenv` 가 `dependencies` 로 올라갈 까닭이 없다는 말을
     * 믿는 대신, 입구에서 닿지 않는다는 것을 여기서 본다. 누가 입구 쪽 파일에서
     * dotenv 를 부르면 위의 검사가 그 파일 이름을 대고 진다.
     */
    for (const dir of ['packages/db', 'packages/auth']) {
      const pkg = PACKAGES.find((p) => p.dir === dir)!;
      expect(Object.keys(pkg.manifest.devDependencies ?? {}), dir).toContain('dotenv');

      const reachable = reachableFiles(pkg);
      const users = sourceFiles(dir).filter((f) =>
        specsOf(readFileSync(f, 'utf8')).some(({ spec }) => packageName(spec) === 'dotenv'),
      );
      expect(users.length, `${dir} 에서 dotenv 를 쓰는 파일이 없어졌다`).toBeGreaterThan(0);
      expect(
        users.filter((f) => reachable.has(f)).map((f) => f.slice(ROOT.length + 1)),
        `${dir} 의 입구에서 dotenv 에 닿는다`,
      ).toEqual([]);
    }
  });
});
