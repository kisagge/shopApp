/**
 * 브라우저로 내려보낼 사전의 범위를 **소스에서 뽑는다.**
 *
 * 서버는 사전 한 벌을 `LocaleProvider` 의 prop 으로 넘긴다(코드가 아니라
 * 데이터로 내려보내는 것이 이 저장소의 결정이다). 그런데 그 한 벌은
 * **화면 코드가 쓰지도 않는 말까지 통째로** 들어 있다 — 메일 본문, 배치
 * 알림, 결제 실패 코드 같은 것들이다. 재 보니 문서를 압축한 35.4KB 중
 * 사전이 13.2KB 였고, 그중 상당 부분이 브라우저에서 한 번도 안 읽힌다.
 *
 * ── 왜 열쇠가 아니라 갈래인가 ──────────────────────────────────
 * 열쇠 하나하나로 자르면 더 줄지만(gzip 5.1KB 대 2.2KB), 화면 코드는 열쇠를
 * **이름으로 조립**한다 — `keysOf(RETURN_REASON, 'returnReason')`,
 * `t.category(slug, …)`, 계약이 돌려준 `valid.*` 문구. 조립한 열쇠가 사전에
 * 없으면 화면이 **그 자리에서 터진다.** 조립은 전부 한 갈래 안에서 일어나므로
 * (접두사까지 변수인 자리는 저장소에 하나도 없다), 갈래째 넣으면 그 위험이
 * 구조적으로 사라진다. 2.2KB 를 위해 화면이 터질 길을 열어 둘 이유가 없다.
 *
 * 뽑는 범위는 `'use client'` 가 붙은 파일에서 시작해 **값 import 를 따라간
 * 모든 모듈**이다. 서버 전용 모듈은 그 그물에 안 걸린다.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';

/** 워크스페이스 별칭. tsconfig 의 paths 와 같은 뜻이다. */
const ALIAS = [
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

const SKIP_DIR = new Set(['node_modules', '.next', 'generated', 'messages']);

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return SKIP_DIR.has(name) ? [] : walk(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

function resolveFile(root, spec, from) {
  let target = null;
  if (spec.startsWith('.')) target = resolve(dirname(from), spec);
  else
    for (const [prefix, replacement] of ALIAS)
      if (spec === prefix || spec.startsWith(prefix)) {
        target = join(root, replacement + spec.slice(prefix.length));
        break;
      }
  if (target === null) return null;
  for (const c of [target, `${target}.ts`, `${target}.tsx`, join(target, 'index.ts'), join(target, 'index.tsx')])
    if (existsSync(c) && statSync(c).isFile()) return c;
  return null;
}

/** `'use client'` 에서 출발해 값 import 로 닿는 모든 파일 */
export function clientReachableFiles(root) {
  const all = [join(root, 'apps/web/src'), join(root, 'packages/ui/src')].flatMap(walk);
  const entries = all.filter((f) => /^\s*['"]use client['"]/m.test(readFileSync(f, 'utf8')));

  const seen = new Set();
  const queue = [...entries];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, 'utf8').matchAll(IMPORT)) {
      const next = resolveFile(root, m[1], file);
      if (next !== null) queue.push(next);
    }
  }
  return { entries, files: [...seen].sort() };
}

/**
 * 브라우저가 쓰는 사전 갈래.
 *
 * 셋을 모은다 — 따옴표째 적힌 열쇠의 갈래, 이름으로 조립하는 자리의 갈래
 * (`keysOf(X, 'g')` · `` `g.${…}` ``), 그리고 번역기의 API 로만 드러나는 갈래
 * (`t.category` 는 category, `translateIssue` 는 valid).
 */
export function clientMessageGroups(root, allKeys) {
  const { files } = clientReachableFiles(root);
  const source = files.map((f) => readFileSync(f, 'utf8')).join('\n');

  const quoted = new Set();
  for (const m of source.matchAll(/'([^'\\\n]*)'|"([^"\n\\]*)"|`([^`\\\n$]*)`/g)) {
    const literal = m[1] ?? m[2] ?? m[3];
    if (literal) quoted.add(literal);
  }

  const groups = new Set();
  for (const key of allKeys) if (quoted.has(key)) groups.add(key.split('.')[0]);
  for (const m of source.matchAll(/keysOf\(\s*[A-Z_]+\s*,\s*'([a-zA-Z]+)'/g)) groups.add(m[1]);
  for (const m of source.matchAll(/`([a-zA-Z]+)(?:\.[a-zA-Z]+)*\.\$\{/g)) groups.add(m[1]);
  // 번역기가 스스로 열쇠를 만드는 두 자리. 부르는 쪽 소스에는 갈래 이름이 없다.
  if (source.includes('.category(')) groups.add('category');
  if (source.includes('translateIssue')) groups.add('valid');

  return [...groups].sort();
}
