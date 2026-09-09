import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';

/**
 * 브라우저로 가는 **코드**가 사전을 들고 있는가.
 *
 * 한동안 세 벌을 들고 있었다. `createTranslator(locale)` 이 ko·en·ja 를 정적으로
 * import 하고 실행 시각에 골랐는데, import 는 빌드 시각에 굳으므로 번들러는
 * 셋을 다 넣었다. 한국어 화면 하나가 gzip 48KB 짜리 청크를 받았고 그중 3분의 2는
 * 절대 읽히지 않는 영어·일본어였다.
 *
 * 고친 방법: **사전을 코드가 아니라 데이터로 내려보낸다.** 서버가 이번 요청의
 * 사전 한 벌을 골라 `LocaleProvider` 의 prop 으로 넘기고, 화면 코드는 사전을
 * import 하지 않는다.
 *
 * ── 먼저 실패한 접근 ──────────────────────────────────────────────
 * 말마다 `dict-ko` · `dict-en` · `dict-ja` 세 모듈을 두고 layout 이 하나를
 * 고르게 했었다. import 그래프는 깨끗하게 갈렸고 이 검사도 통과했다. 그런데
 * **번들은 하나도 안 갈렸다** — Turbopack 이 한 layout 이 참조하는 클라이언트
 * 모듈들을 한 청크로 합쳤고, 셋이 같은 청크 목록을 받았다. 그래서 이 검사는
 * 소스가 아니라 **빌드 결과**를 본다. 빌드가 없으면 소스 검사로 내려간다.
 */

const ROOT = resolve(import.meta.dirname, '../../..');
const WEB = join(ROOT, 'apps/web');
const CHUNKS = join(WEB, '.next/static/chunks');

/** 사전 한 벌 분량의 글자가 있으면 그 사전이 들어 있는 것이다. */
const SIGN = {
  ja: /[぀-ゟ゠-ヿ]/g,
  ko: /[가-힣]/g,
} as const;

/** 한 벌은 글자 수천 자다. 화면 문구 몇 개와는 자릿수가 다르다. */
const DICTIONARY_SIZE = 2000;

describe('브라우저 코드 안의 사전', () => {
  const built = existsSync(CHUNKS);

  it.runIf(built)('어떤 청크도 사전 한 벌을 통째로 들고 있지 않다', () => {
    const heavy = readdirSync(CHUNKS)
      .filter((f) => f.endsWith('.js'))
      .map((f) => {
        const source = readFileSync(join(CHUNKS, f), 'utf8');
        return {
          file: f,
          ja: (source.match(SIGN.ja) ?? []).length,
          ko: (source.match(SIGN.ko) ?? []).length,
        };
      })
      .filter((c) => c.ja >= DICTIONARY_SIZE || c.ko >= DICTIONARY_SIZE);

    expect(
      heavy,
      '사전이 번들에 들어갔다. 화면 코드가 @shop/i18n/messages/* 를 import 하면\n' +
        '번들러는 고를 수 있는 사전을 전부 넣는다. 사전은 서버가 prop 으로 넘긴다.',
    ).toEqual([]);
  });

  /** 빌드 전에도 도는 몫 — 위 검사가 잡을 일을 소스에서 미리 막는다. */
  it('화면 코드에서 사전 모듈에 닿을 수 없다', () => {
    const ALIAS: ReadonlyArray<readonly [string, string]> = [
      ['@shop/i18n/messages/', 'packages/i18n/src/messages/'],
      ['@shop/i18n/locale', 'packages/i18n/src/locale'],
      ['@shop/i18n/all', 'packages/i18n/src/all'],
      ['@shop/i18n', 'packages/i18n/src/index'],
      ['@shop/ui', 'packages/ui/src/index'],
      ['@shop/core', 'packages/core/src/index'],
      ['@shop/contract', 'packages/contract/src/index'],
      ['~/', 'apps/web/src/'],
    ];
    /** 값 import 만 본다 — `import type` 은 컴파일 뒤에 바이트를 남기지 않는다. */
    const IMPORT = /^\s*(?:import|export)\s+(?!type\s)(?:[^'"]*?from\s+)?['"]([^'"]+)['"]/gm;

    const resolveFile = (spec: string, from: string): string | null => {
      let target: string | null = null;
      if (spec.startsWith('.')) target = resolve(dirname(from), spec);
      else
        for (const [prefix, replacement] of ALIAS)
          if (spec === prefix || spec.startsWith(prefix)) {
            target = join(ROOT, replacement + spec.slice(prefix.length));
            break;
          }
      if (target === null) return null;
      for (const c of [target, `${target}.ts`, `${target}.tsx`, join(target, 'index.ts')])
        if (existsSync(c) && statSync(c).isFile()) return c;
      return null;
    };

    const reachable = (entry: string): ReadonlySet<string> => {
      const seen = new Set<string>();
      const queue = [entry];
      while (queue.length > 0) {
        const file = queue.pop()!;
        if (seen.has(file)) continue;
        seen.add(file);
        for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
          const next = resolveFile(m[1]!, file);
          if (next !== null) queue.push(next);
        }
      }
      return seen;
    };

    const walk = (dir: string): readonly string[] =>
      readdirSync(dir).flatMap((name) => {
        const full = join(dir, name);
        return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : [];
      });

    const src = join(WEB, 'src');
    const dictionaries = ['ko', 'en', 'ja'].map((l) =>
      join(ROOT, `packages/i18n/src/messages/${l}.ts`),
    );

    const offenders = walk(src)
      .filter((f) => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')))
      .flatMap((f) => {
        const files = reachable(f);
        const hit = dictionaries.filter((d) => files.has(d));
        return hit.length > 0 ? [`${f.slice(src.length + 1)} → ${hit.length}벌`] : [];
      });

    expect(offenders, "'use client' 파일이 사전에 닿는다").toEqual([]);
  });
});
