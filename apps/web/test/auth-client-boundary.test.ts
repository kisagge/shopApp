import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * **인증 SDK 를 모든 화면이 받지 않게 지킨다.**
 *
 * 헤더의 로그인 영역과 장바구니 동기화가 `authClient.useSession()` 으로 세션을
 * 직접 물었고, 그 둘이 루트 레이아웃에 있어서 **better-auth 클라이언트가 모든
 * 화면에 gzip 12KB 씩 따라왔다.** 홈에서 상품 상세까지, 로그인과 아무 상관없는
 * 화면까지 전부.
 *
 * 지금은 서버가 세션을 넘겨 준다. 인증 SDK 는 로그인·가입처럼 실제로 쓰는
 * 화면에만 있고, 앱의 쿠키 유실 대비 경로는 `import()` 로 그때 받는다.
 *
 * 바이트 상한(`bundle.ts`)으로는 이것을 못 잡는다 — 12KB 는 800KB 상한 안에서
 * 티가 나지 않는다. 그래서 **모듈이 닿는지**를 본다.
 */

const WEB = resolve(import.meta.dirname, '..');
const SRC = join(WEB, 'src');
const AUTH_CLIENT = '@shop/auth/client';

/** 값 import 만 본다. `await import(...)` 는 여기 걸리지 않는다 — 그것이 요점이다. */
const STATIC_IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm;

const ALIAS: ReadonlyArray<readonly [string, string]> = [['~/', 'src/']];

function resolveFile(spec: string, from: string): string | null {
  let target: string | null = null;
  if (spec.startsWith('.')) target = resolve(dirname(from), spec);
  else
    for (const [prefix, replacement] of ALIAS)
      if (spec.startsWith(prefix)) target = join(WEB, replacement + spec.slice(prefix.length));
  if (target === null) return null;
  for (const c of [target, `${target}.ts`, `${target}.tsx`, join(target, 'index.ts')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** 이 파일에서 정적으로 닿을 수 있는 것들. `@shop/auth/client` 에 닿으면 true. */
function reachesAuthClient(entry: string): readonly string[] | null {
  const seen = new Set<string>();
  const queue: { file: string; path: string[] }[] = [{ file: entry, path: [entry] }];

  while (queue.length > 0) {
    const { file, path } = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    for (const m of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const spec = m[1]!;
      if (spec === AUTH_CLIENT) return [...path.map((p) => p.slice(SRC.length + 1)), AUTH_CLIENT];
      const next = resolveFile(spec, file);
      if (next !== null) queue.push({ file: next, path: [...path, next] });
    }
  }
  return null;
}

function walk(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
  });
}

/**
 * 인증 SDK 를 정적으로 들여도 되는 화면과 그 이유.
 *
 * 이름만 적는 것은 목록으로 되돌아가는 것과 같다.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  'components/login-form.tsx': '로그인 그 자체다. 여기서 안 쓰면 쓸 곳이 없다.',
  'components/signup-form.tsx': '가입하면서 바로 로그인시킨다.',
  'components/google-button.tsx': '소셜 로그인은 SDK 가 리다이렉트를 맡는다.',
  'components/forgot-password-form.tsx': '재설정 메일 요청이 SDK 를 지난다.',
  'components/reset-password-form.tsx': '새 비밀번호를 SDK 로 넘긴다.',
};

describe('인증 SDK 의 경계', () => {
  it('루트 레이아웃에서 정적으로 닿을 수 없다 — 닿으면 모든 화면이 받는다', () => {
    const path = reachesAuthClient(join(SRC, 'app/layout.tsx'));

    expect(
      path,
      `루트 레이아웃이 ${AUTH_CLIENT} 에 닿는다. 모든 화면이 gzip 12KB 를 더 받게 된다.\n` +
        `세션은 서버가 주고(lib/viewer), 정말 필요하면 \`await import()\` 로 그때 받는다.\n` +
        `경로: ${path?.join(' → ')}`,
    ).toBeNull();
  });

  it('사이트 헤더에서도 닿을 수 없다 — 헤더는 모든 화면에 있다', () => {
    expect(reachesAuthClient(join(SRC, 'components/site-header.tsx'))).toBeNull();
  });

  it('정적으로 들이는 곳은 인증 화면뿐이다', () => {
    const importers = walk(SRC)
      .filter((f) => {
        const source = readFileSync(f, 'utf8');
        return [...source.matchAll(STATIC_IMPORT)].some((m) => m[1] === AUTH_CLIENT);
      })
      .map((f) => f.slice(SRC.length + 1))
      .sort();

    expect(
      importers.filter((f) => !(f in ALLOWED)),
      '인증 SDK 를 정적으로 들이면 그 화면의 조각에 통째로 들어간다.\n' +
        '`await import()` 로 바꾸거나, 인증 화면이라면 ALLOWED 에 이유와 함께 적는다.',
    ).toEqual([]);
  });

  it('허용 목록에 이유 없이 적힌 것이 없다', () => {
    expect(Object.entries(ALLOWED).filter(([, why]) => why.trim().length < 15)).toEqual([]);
  });
});
