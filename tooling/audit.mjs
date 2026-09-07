#!/usr/bin/env node
/**
 * 의존성 권고를 본다.
 *
 * **지금 뜬 것으로 CI 를 빨갛게 만들지 않는다.** 15건이 있는데 전부 전이
 * 의존이고 우리가 고칠 수 있는 것이 없다. 그대로 실패하게 두면 CI 는 늘
 * 빨간 상태가 되고, 그때부터 아무도 안 본다 — 검사가 있으나 마나가 된다.
 *
 * 그래서 규칙을 이렇게 세운다.
 *
 *   1. 아는 권고는 **이유와 함께** 허용 목록에 둔다 (tooling/audit-allow.json)
 *   2. 목록에 없는 권고가 뜨면 진다  ← 이게 이 검사의 전부다
 *   3. 목록에 있는데 더 이상 안 뜨면 진다 (낡은 면제를 남기지 않는다)
 *
 * 요청 제한·매대 조건 가드와 같은 모양이다. 빼는 것은 되지만 **왜 빼는지를
 * 적어야** 하고, 빼 둔 이유가 유효한지는 검사가 계속 확인한다.
 */
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const ALLOW_FILE = join(HERE, 'audit-allow.json');

/** 이 밑으로는 보지 않는다. low·info 는 전이 의존에서 끝없이 나온다. */
const MIN_SEVERITY = ['moderate', 'high', 'critical'];

async function audit() {
  try {
    /*
     * 권고가 하나라도 있으면 pnpm audit 은 0 이 아닌 코드로 끝난다.
     * 그건 실패가 아니라 결과라서, 여기서는 stdout 만 본다.
     */
    const { stdout } = await run('pnpm', ['audit', '--json'], { maxBuffer: 32 * 1024 * 1024 });
    return JSON.parse(stdout);
  } catch (error) {
    const stdout = /** @type {{ stdout?: string }} */ (error).stdout;
    if (!stdout) throw error;
    return JSON.parse(stdout);
  }
}

function allowed() {
  const raw = JSON.parse(readFileSync(ALLOW_FILE, 'utf8'));
  /** @type {Map<string, string>} */
  const map = new Map();
  for (const [name, entry] of Object.entries(raw)) {
    if (name === '//') continue;
    if (!entry.note?.trim()) {
      // 스택을 찍어 봐야 읽을 것이 없다. 무엇을 고쳐야 하는지만 말한다.
      console.error(`\n${name} 에 왜 두는지가 없다. 이름만 적는 것은 목록으로 되돌아가는 것이다.\n`);
      process.exit(1);
    }
    for (const id of entry.advisories) map.set(id, name);
  }
  return map;
}

const [report, allow] = [await audit(), allowed()];

/** @type {Map<string, { module: string; severity: string; title: string; url: string }>} */
const found = new Map();
for (const a of Object.values(report.advisories ?? {})) {
  if (!MIN_SEVERITY.includes(a.severity)) continue;
  found.set(a.github_advisory_id, {
    module: a.module_name,
    severity: a.severity,
    title: a.title,
    url: a.url,
  });
}

const fresh = [...found].filter(([id]) => !allow.has(id));
const stale = [...allow.keys()].filter((id) => !found.has(id));

if (fresh.length > 0) {
  console.error(`\n새 권고 ${fresh.length}건 — 목록에 없다.\n`);
  for (const [id, a] of fresh) {
    console.error(`  ${a.severity.padEnd(9)} ${a.module.padEnd(16)} ${a.title}`);
    console.error(`  ${' '.repeat(9)} ${id}  ${a.url}\n`);
  }
  console.error('고칠 수 있으면 올리고, 둘 이유가 있으면 tooling/audit-allow.json 에 이유와 함께 적는다.\n');
}

if (stale.length > 0) {
  console.error(`\n낡은 면제 ${stale.length}건 — 더 이상 뜨지 않는다. 지운다.\n`);
  for (const id of stale) console.error(`  ${id}  (${allow.get(id)})`);
  console.error('');
}

if (fresh.length > 0 || stale.length > 0) process.exit(1);

console.log(`의존성 권고 ${found.size}건, 전부 이유가 적힌 것입니다.`);
