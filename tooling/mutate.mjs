#!/usr/bin/env node
/**
 * 그물이 헛돌지 않는지 돌연변이로 판별한다.
 *
 * **검사가 늘었다는 것은 지켜진다는 뜻이 아니다.** 커버리지는 "그 줄이 돌았다"
 * 까지만 말하고, 돌면서 아무것도 안 보는 검사도 초록이다. 이 저장소에서 실제로
 * 여러 번 겪었다 — 패널이 사라진 뒤의 상태를 단정하거나, 단추의 `disabled` 를
 * 보면서 정작 보낸 값을 안 보거나, 마운트가 이미 하는 일을 "아무 일도 없다" 로
 * 단정하거나.
 *
 * 그래서 **소스를 일부러 망가뜨려 보고, 검사가 지는지로 판별한다.** 안 지면 그
 * 자리는 비어 있다. 쓰는 법:
 *
 *   pnpm mutate apps/web tooling/mutations/예시.json test/foo.test.ts [...]
 *
 * 돌연변이 파일은 `[{ name, file, from, to }]` 이고 `file` 은 묶음 뿌리 기준이다.
 * `from` 은 그 파일에 **정확히 한 번** 나와야 한다 — 여러 번이면 어느 자리를
 * 바꾸는지 알 수 없으므로 건너뛴다.
 *
 * ── 가드 넷 ─────────────────────────────────────────────
 *
 * 돌연변이를 믿으려면 **검사가 진짜 돌았는지**를 먼저 알아야 한다. 네 번 속았고,
 * 그때마다 "아무도 안 진다" 를 "그물이 비었다" 로 잘못 읽을 뻔했다.
 *
 *   1. 기준(baseline)의 **통과 수**를 먼저 재고 그 수와 비교한다.
 *      수를 안 재면 "0개 실패" 가 "검사가 하나도 안 돌았다" 와 구분되지 않는다.
 *   2. 실패가 0인데 통과 수가 **줄었으면** 안 돌은 것이다. 돌연변이가 파일을
 *      깨뜨려 수집 단계에서 떨어지면 이 모양이 된다.
 *   3. 수는 `Test Files` 가 아니라 **`Tests` 줄**에서 읽는다. 둘 다 "N passed"
 *      라서 앞엣것을 읽으면 늘 작은 수가 나온다.
 *   4. `from === to` 면 **아무것도 안 바뀐 것**이다. 들여쓰기를 잘못 적어
 *      치환이 헛돌았을 때가 그런데, 그러면 "살아남았다" 로 보인다.
 *
 * 떨어진(죽은) 검사가 하나도 없는 돌연변이가 남으면 1 로 끝낸다.
 */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [packageDir, mutationsFile, ...testFiles] = process.argv.slice(2);

if (!packageDir || !mutationsFile || testFiles.length === 0) {
  console.error('쓰는 법: pnpm mutate <묶음 뿌리> <mutations.json> <검사 파일...>');
  process.exit(2);
}

const root = resolve(packageDir);
/** @type {{ name: string, file: string, from: string, to: string }[]} */
const mutations = JSON.parse(readFileSync(mutationsFile, 'utf8'));

/** `Tests  2 failed | 119 passed (121)` 에서 둘을 읽는다 (가드 3) */
const TESTS = /^\s*Tests\s+(?:(\d+) failed \| )?(\d+) passed/m;
const ANSI = /\u001b\[[0-9;]*m/g;

/** @returns {Promise<{ failed: number, passed: number } | null>} */
function runTests() {
  return new Promise((done) => {
    const child = spawn('./node_modules/.bin/vitest', ['run', ...testFiles, '--reporter=default'], {
      cwd: root,
      env: {
        ...process.env,
        // 단위 검사는 DB 를 안 쓰지만 Prisma 가 주소 모양은 확인한다
        DATABASE_URL: process.env['DATABASE_URL'] ?? 'postgresql://dummy:dummy@localhost:5432/unit_only',
      },
    });

    let output = '';
    child.stdout.on('data', (chunk) => void (output += chunk));
    child.stderr.on('data', (chunk) => void (output += chunk));
    child.on('close', () => {
      const hit = TESTS.exec(output.replace(ANSI, ''));
      done(hit === null ? null : { failed: Number(hit[1] ?? 0), passed: Number(hit[2]) });
    });
  });
}

const base = await runTests();
if (base === null) {
  console.error('기준을 못 읽었다 — 검사가 아예 안 돌았다.');
  process.exit(2);
}
if (base.failed > 0) {
  console.error(`기준부터 ${base.failed}개가 진다 — 먼저 그것을 고친다.`);
  process.exit(2);
}

console.log(`${mutations.length} 개`);
console.log(`기준: ${base.passed}개 통과\n`);

/** @type {string[]} */
const survived = [];

for (const mutation of mutations) {
  // 가드 4 — 바뀌는 것이 없으면 판별이 아니다
  if (mutation.from === mutation.to) {
    console.log(`  ?  ${mutation.name}: from 과 to 가 같다 — 건너뜀`);
    continue;
  }

  const path = join(root, mutation.file);
  const original = readFileSync(path, 'utf8');
  const count = original.split(mutation.from).length - 1;
  if (count !== 1) {
    console.log(`  ?  ${mutation.name}: 바꿀 자리를 ${count}번 찾았다 — 건너뜀`);
    continue;
  }

  writeFileSync(path, original.replace(mutation.from, mutation.to));
  let result = null;
  try {
    result = await runTests();
  } finally {
    // 어떤 일이 있어도 원래대로 돌려 놓는다
    writeFileSync(path, original);
  }

  if (result === null) {
    console.log(`  ?  ${mutation.name}: 검사가 안 돌았다(파일이 터졌다)`);
    continue;
  }
  // 가드 2 — 실패가 없는데 통과가 줄었으면 돌지 않은 것이다
  if (result.failed === 0 && result.passed < base.passed) {
    console.log(`  ?  ${mutation.name}: 실패 0인데 통과가 줄었다 — 검사가 안 돌았다`);
    continue;
  }

  if (result.failed > 0) {
    console.log(`  ✓  ${mutation.name}: ${result.failed}개가 진다`);
  } else {
    console.log(`  ✗  ${mutation.name}: 아무도 안 진다 — 검사가 비었다`);
    survived.push(mutation.name);
  }
}

console.log(`\n살아남음 ${survived.length}/${mutations.length}`);
for (const name of survived) console.log(`  · ${name}`);

/*
 * 살아남은 것이 늘 고장인 것은 아니다 — 뜻이 같은 돌연변이이거나(같은 답을 내는
 * 다른 표현), 닿을 수 없는 가드일 수 있다. 그때는 **왜 안 지는지를 소스에 적는다.**
 * 다만 기본은 "검사가 비었다" 이므로 0 이 아닌 코드로 끝낸다.
 */
process.exit(survived.length > 0 ? 1 : 0);
